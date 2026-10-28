import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import { verifyMediaDomainSpec, verifyMediaInspection, verifyPreparedMedia } from "@hypit/media";
import { assertClockIdentity } from "@hypit/timeline";
import type { Clock } from "@hypit/timeline";
import { durationInFrames } from "@hypit/temporal";
import type { TemporalDuration } from "@hypit/temporal";
import type { BlobRef, CanonicalValue, Value } from "@hypit/hypit/protocol";
import { assertBlobRef, canonicalize } from "@hypit/hypit/protocol";

import { mediaOperationsProducers, mediaOperationsTypes } from "./manifest.js";
import {
  selectMediaStreams,
  selectAudioStream,
  selectVideoStream,
  verifyMediaSelectionRequest,
} from "./selection.js";
import {
  bindStillVideoSource,
  planStillVideoSegments,
  sealStillVideoRequest,
  verifyStillVideoLayout,
  verifyAudioExtractionRequest,
  verifyFrameExtractionRequest,
  verifyMediaTransformProgram,
  verifyStillVideoRequest,
  transformPreparedMedia,
} from "./operations.js";
import type {
  AudioExtractionRequest,
  ExtractAudioNeed,
  ExtractFrameNeed,
  FrameExtractionRequest,
  InspectMediaNeed,
  RenderStillVideoNeed,
  StillVideoLayout,
  StillVideoRequest,
} from "./types.js";
import type { MediaDomainSpec, PreparedMedia } from "@hypit/media";

function valueOf(value: Value, subject: string): CanonicalValue {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value;
}

function blob(value: Value, subject: string): BlobRef {
  assertBlobRef(value, subject);
  return value;
}

export const mediaOperationsComponent = {
  refinements: [
    {
      type: mediaOperationsTypes.selectionRequest,
      handler: ({ value }) => {
        verifyMediaSelectionRequest(valueOf(value, "MediaSelectionRequest"));
      },
    },
    {
      type: mediaOperationsTypes.transformProgram,
      handler: ({ value }) => {
        verifyMediaTransformProgram(valueOf(value, "MediaTransformProgram"));
      },
    },
    {
      type: mediaOperationsTypes.audioExtractionRequest,
      handler: ({ value }) => {
        verifyAudioExtractionRequest(valueOf(value, "AudioExtractionRequest"));
      },
    },
    {
      type: mediaOperationsTypes.frameExtractionRequest,
      handler: ({ value }) => {
        verifyFrameExtractionRequest(valueOf(value, "FrameExtractionRequest"));
      },
    },
    {
      type: mediaOperationsTypes.stillVideoLayout,
      handler: ({ value }) => {
        verifyStillVideoLayout(valueOf(value, "StillVideoLayout"));
      },
    },
    {
      type: mediaOperationsTypes.stillVideoRequest,
      handler: ({ value }) => {
        verifyStillVideoRequest(valueOf(value, "StillVideoRequest"));
      },
    },
  ],
  producers: [
    {
      producer: mediaOperationsProducers.inspect,
      handler: ({ inputs }) => {
        const source = blob(inputs.source!.value, "Media inspection source");
        const need: InspectMediaNeed = { source };
        return { kind: "need", constraints: canonicalize(need) };
      },
    },
    {
      producer: mediaOperationsProducers.select,
      handler: ({ inputs }) => {
        const inspection = valueOf(inputs.inspection!.value, "MediaInspection");
        const request = valueOf(inputs.request!.value, "MediaSelectionRequest");
        verifyMediaInspection(inspection);
        verifyMediaSelectionRequest(request);
        return { kind: "output", value: (canonicalize(selectMediaStreams(inspection, request))) };
      },
    },
    {
      producer: mediaOperationsProducers.transform,
      handler: ({ inputs }) => {
        const media = valueOf(inputs.media!.value, "PreparedMedia") as unknown as PreparedMedia;
        const program = valueOf(inputs.program!.value, "MediaTransformProgram");
        const spec = valueOf(inputs.spec!.value, "MediaDomainSpec") as unknown as MediaDomainSpec;
        verifyPreparedMedia(media);
        verifyMediaTransformProgram(program);
        verifyMediaDomainSpec(spec);
        return { kind: "output", value: canonicalize(transformPreparedMedia(media, program, spec.id)) };
      },
    },
    {
      producer: mediaOperationsProducers.extractAudio,
      handler: ({ inputs }) => {
        const source = blob(inputs.source!.value, "Audio extraction source");
        const inspection = valueOf(inputs.inspection!.value, "MediaInspection");
        const request = valueOf(inputs.request!.value, "AudioExtractionRequest") as unknown as AudioExtractionRequest;
        verifyMediaInspection(inspection);
        verifyAudioExtractionRequest(request);
        const selected = selectAudioStream(inspection, request.audio);
        const need: ExtractAudioNeed = {
          source,
          streamIndex: selected.index,
          output: request.output,
        };
        return { kind: "need", constraints: canonicalize(need) };
      },
    },
    {
      producer: mediaOperationsProducers.extractFrame,
      handler: ({ inputs }) => {
        const source = blob(inputs.source!.value, "Frame extraction source");
        const inspection = valueOf(inputs.inspection!.value, "MediaInspection");
        const request = valueOf(inputs.request!.value, "FrameExtractionRequest") as unknown as FrameExtractionRequest;
        verifyMediaInspection(inspection);
        verifyFrameExtractionRequest(request);
        const selected = selectVideoStream(inspection, request.video);
        if (request.at.kind === "frame" && request.at.index >= selected.decodedUnitCount) {
          throw new Error(`Frame ${request.at.index} is outside the selected stream (${selected.decodedUnitCount} frames)`);
        }
        const need: ExtractFrameNeed = {
          source,
          streamIndex: selected.index,
          sourceFrameCount: selected.decodedUnitCount,
          at: request.at,
          output: request.output,
        };
        return { kind: "need", constraints: canonicalize(need) };
      },
    },
    {
      producer: mediaOperationsProducers.planStill,
      handler: ({ inputs }) => {
        const duration = valueOf(inputs.duration!.value, "TemporalDuration") as unknown as TemporalDuration;
        const clock = valueOf(inputs.clock!.value, "Clock") as unknown as Clock;
        assertClockIdentity(clock);
        const layout = valueOf(inputs.layout!.value, "StillVideoLayout") as unknown as StillVideoLayout;
        verifyStillVideoLayout(layout);
        const exactFrames = durationInFrames(duration, clock);
        if (exactFrames.numerator <= 0n || exactFrames.denominator !== 1n
          || exactFrames.numerator > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error("Still video duration must resolve to a positive whole frame count");
        }
        const frames = Number(exactFrames.numerator);
        const request = sealStillVideoRequest({
          frameRate: clock.frameRate,
          frameCount: frames,
          output: { container: "mp4", codec: "h264", pixelFormat: "yuv420p" },
          segments: planStillVideoSegments(frames, layout.weights),
        });
        return { kind: "output", value: (canonicalize(request)) };
      },
    },
    {
      producer: mediaOperationsProducers.bindStill,
      handler: ({ inputs }) => {
        const request = valueOf(inputs.request!.value, "StillVideoRequest") as unknown as StillVideoRequest;
        const source = blob(inputs.source!.value, "Still video source");
        const bound = bindStillVideoSource(request, source);
        return { kind: "output", value: (canonicalize(bound)) };
      },
    },
    {
      producer: mediaOperationsProducers.renderStill,
      handler: ({ inputs }) => {
        const request = valueOf(inputs.request!.value, "StillVideoRequest") as unknown as StillVideoRequest;
        verifyStillVideoRequest(request);
        if (request.segments.some((segment) => segment.source === undefined)) {
          throw new Error("Still video has a segment without a picture");
        }
        const need: RenderStillVideoNeed = { request };
        return { kind: "need", constraints: canonicalize(need) };
      },
    },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
