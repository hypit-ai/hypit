import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import { selectAudioStream, selectVideoStream, verifyMediaInspection } from "@hypit/media";
import { assertTemporalSamplingGrid, durationInFrames } from "@hypit/temporal";
import type { TemporalDuration, TemporalSamplingGrid } from "@hypit/temporal";
import type { BlobRef, CanonicalValue, Value } from "@hypit/hypit/protocol";
import { assertBlobRef, canonicalize } from "@hypit/hypit/protocol";

import { mediaOperationsProducers, mediaOperationsTypes } from "./manifest.js";
import {
  bindStillVideoSource,
  planStillVideoSegments,
  sealStillVideoRequest,
  verifyStillVideoLayout,
  verifyAudioExtractionRequest,
  verifyFrameExtractionRequest,
  verifyStillVideoRequest,
} from "./operations.js";
import type {
  AudioExtractionRequest,
  ExtractAudioNeed,
  ExtractFrameNeed,
  FrameExtractionRequest,
  RenderStillVideoNeed,
  StillVideoLayout,
  StillVideoRequest,
} from "./types.js";

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
        };
        return { kind: "need", constraints: canonicalize(need) };
      },
    },
    {
      producer: mediaOperationsProducers.planStill,
      handler: ({ inputs }) => {
        const duration = valueOf(inputs.duration!.value, "TemporalDuration") as unknown as TemporalDuration;
        const sampling = valueOf(inputs.sampling!.value, "TemporalSamplingGrid") as unknown as TemporalSamplingGrid;
        assertTemporalSamplingGrid(sampling);
        const layout = valueOf(inputs.layout!.value, "StillVideoLayout") as unknown as StillVideoLayout;
        verifyStillVideoLayout(layout);
        const exactFrames = durationInFrames(duration, sampling);
        if (exactFrames.numerator <= 0n || exactFrames.denominator !== 1n
          || exactFrames.numerator > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error("Still video duration must resolve to a positive whole frame count");
        }
        const frames = Number(exactFrames.numerator);
        const request = sealStillVideoRequest({
          frameRate: sampling.frameRate,
          frameCount: frames,
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
