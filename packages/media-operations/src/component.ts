import { mediaFrameRangeSamples, verifyMediaFrameRange } from "@hypit/media";
import { mediaComponent } from "@hypit/media";
import { plannedNeedInputs } from "@hypit/hypit/producer";
import type { ProducerPackage, PlannedNeedFacet } from "@hypit/hypit/producer";
import type { AdmissionPackage } from "@hypit/hypit/admission";
import { verifyMediaInspection, verifyMediaStreamSelection, verifyMuxedMedia, verifyTimelineVisual, verifySynchronizedMedia, verifyTimelineAudio } from "@hypit/media";
import type { MediaInspection, MediaStreamSelection, MuxedMedia, TimelineVisual, TimelineAudio } from "@hypit/media";
import { assertClockIdentity } from "@hypit/timeline";
import type { Clock, Timeline } from "@hypit/timeline";
import { durationInFrames } from "@hypit/temporal";
import type { TemporalDuration } from "@hypit/temporal";
import type { Composition } from "@hypit/composition";
import type { BlobRef, CanonicalValue, CapabilityRef, ProducerRef, StoredValue } from "@hypit/hypit/protocol";
import { canonicalize } from "@hypit/hypit/protocol";

import {
  compileAudioProgramPlan,
  verifyAudioProgramPlan,
} from "./audio-plan.js";
import { mediaOperationsCapabilities, mediaOperationsProducers, mediaOperationsTypes } from "./manifest.js";
import {
  selectMediaStreams,
  verifyMediaSelectionRequest,
} from "./selection.js";
import {
  selectAudioStream,
  selectVideoStream,
  bindStillVideoSource,
  planStillVideoSegments,
  sealStillVideoRequest,
  verifyStillVideoLayout,
  verifyAudioExtractionRequest,
  verifyFrameExtractionRequest,
  verifyMediaTransformProgram,
  verifyStillVideoRequest,
} from "./operations.js";
import type {
  AudioExtractionRequest,
  CompositeMediaNeed,
  ExtractAudioNeed,
  ExtractFrameNeed,
  FrameExtractionRequest,
  InspectMediaNeed,
  MuxMediaNeed,
  MediaSelectionRequest,
  NormalizeMediaNeed,
  RenderAudioNeed,
  RenderStillVideoNeed,
  StillVideoLayout,
  StillVideoRequest,
  TransformMediaNeed,
} from "./types.js";

function inline(value: StoredValue, subject: string): CanonicalValue {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}

function blob(value: StoredValue, subject: string): BlobRef {
  if (value.kind !== "blob") throw new Error(`${subject} must be a Blob`);
  return value;
}

/** Preserve unresolved graph inputs without pretending a structured value is a file. */
function plannedMediaNeed(
  producer: ProducerRef,
  port: string,
  capability: CapabilityRef,
  roles: Readonly<Record<string, string>> = {},
  present?: PlannedNeedFacet["present"],
): PlannedNeedFacet {
  return {
    producer,
    port,
    capability,
    plan({ state, step }) {
      return { constraints: {}, pendingInputs: plannedNeedInputs(state, step, roles) };
    },
    present(specification) {
      if (present !== undefined) return present(specification);
      const references: Record<string, number> = {};
      for (const item of specification.pendingInputs) {
        const role = item.role;
        if (role === undefined) continue;
        references[role] = (references[role] ?? 0) + 1;
      }
      return { fields: {}, references };
    },
  };
}

const presentAudioRender: NonNullable<PlannedNeedFacet["present"]> = (specification) => {
  const request = specification.constraints as Partial<RenderAudioNeed>;
  if (request.plan === undefined) return { fields: {}, references: {} };
  const { plan, range } = request;
  return { fields: {
    startFrame: [range?.startFrame ?? 0],
    endFrameExclusive: [range?.endFrameExclusive ?? plan.frameCount],
    frameRate: [`${plan.frameRate.numerator}/${plan.frameRate.denominator}`],
    sampleRate: [plan.sampleRate],
  }, references: {} };
};

export const mediaOperationsComponent = {
  validators: [
    {
      type: mediaOperationsTypes.selectionRequest,
      handler: ({ value }) => {
        verifyMediaSelectionRequest(inline(value, "MediaSelectionRequest"));
      },
    },
    {
      type: mediaOperationsTypes.audioProgramPlan,
      handler: ({ value }) => {
        verifyAudioProgramPlan(inline(value, "AudioProgramPlan"));
      },
    },
    {
      type: mediaOperationsTypes.transformProgram,
      handler: ({ value }) => {
        verifyMediaTransformProgram(inline(value, "MediaTransformProgram"));
      },
    },
    {
      type: mediaOperationsTypes.audioExtractionRequest,
      handler: ({ value }) => {
        verifyAudioExtractionRequest(inline(value, "AudioExtractionRequest"));
      },
    },
    {
      type: mediaOperationsTypes.frameExtractionRequest,
      handler: ({ value }) => {
        verifyFrameExtractionRequest(inline(value, "FrameExtractionRequest"));
      },
    },
    {
      type: mediaOperationsTypes.stillVideoLayout,
      handler: ({ value }) => {
        verifyStillVideoLayout(inline(value, "StillVideoLayout"));
      },
    },
    {
      type: mediaOperationsTypes.stillVideoRequest,
      handler: ({ value }) => {
        verifyStillVideoRequest(inline(value, "StillVideoRequest"));
      },
    },
  ],
  producers: [
    {
      producer: mediaOperationsProducers.inspect,
      handler: ({ inputs }) => {
        const source = blob(inputs.source!.value, "Media inspection source");
        const need: InspectMediaNeed = { source };
        return { outputs: {}, needs: { inspection: canonicalize(need) } };
      },
    },
    {
      producer: mediaOperationsProducers.select,
      handler: ({ inputs }) => {
        const inspection = inline(inputs.inspection!.value, "MediaInspection");
        const request = inline(inputs.request!.value, "MediaSelectionRequest");
        verifyMediaInspection(inspection);
        verifyMediaSelectionRequest(request);
        return {
          outputs: {
            selection: { kind: "inline", value: canonicalize(selectMediaStreams(inspection, request)) },
          },
          needs: {},
        };
      },
    },
    {
      producer: mediaOperationsProducers.normalize,
      handler: ({ inputs }) => {
        const source = blob(inputs.source!.value, "Media normalization source");
        const inspection = inline(inputs.inspection!.value, "MediaInspection");
        const selection = inline(inputs.selection!.value, "MediaStreamSelection");
        const request = inline(inputs.request!.value, "MediaSelectionRequest");
        verifyMediaInspection(inspection);
        verifyMediaStreamSelection(selection);
        verifyMediaSelectionRequest(request);
        const need: NormalizeMediaNeed = {
          source,
          inspection,
          selection,
          frameRate: request.frameRate,
          audio: { sampleRate: 48_000, channels: 2, codec: "pcm_s16le", loudness: "preserve" },
        };
        return { outputs: {}, needs: { media: canonicalize(need) } };
      },
    },
    {
      producer: mediaOperationsProducers.transform,
      handler: ({ inputs }) => {
        const media = inline(inputs.media!.value, "SynchronizedMedia");
        const program = inline(inputs.program!.value, "MediaTransformProgram");
        verifySynchronizedMedia(media);
        verifyMediaTransformProgram(program);
        if (media.visual === undefined) throw new Error("Media transform requires a visual stream");
        const need: TransformMediaNeed = {
          media,
          program,
        };
        return { outputs: {}, needs: { video: canonicalize(need) } };
      },
    },
    {
      producer: mediaOperationsProducers.extractAudio,
      handler: ({ inputs }) => {
        const source = blob(inputs.source!.value, "Audio extraction source");
        const inspection = inline(inputs.inspection!.value, "MediaInspection");
        const request = inline(inputs.request!.value, "AudioExtractionRequest") as unknown as AudioExtractionRequest;
        verifyMediaInspection(inspection);
        verifyAudioExtractionRequest(request);
        const selected = selectAudioStream(inspection, request.audio);
        const need: ExtractAudioNeed = {
          source,
          streamIndex: selected.index,
          output: request.output,
        };
        return { outputs: {}, needs: { audio: canonicalize(need) } };
      },
    },
    {
      producer: mediaOperationsProducers.extractFrame,
      handler: ({ inputs }) => {
        const source = blob(inputs.source!.value, "Frame extraction source");
        const inspection = inline(inputs.inspection!.value, "MediaInspection");
        const request = inline(inputs.request!.value, "FrameExtractionRequest") as unknown as FrameExtractionRequest;
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
        return { outputs: {}, needs: { image: canonicalize(need) } };
      },
    },
    {
      producer: mediaOperationsProducers.planStill,
      handler: ({ inputs }) => {
        const duration = inline(inputs.duration!.value, "TemporalDuration") as unknown as TemporalDuration;
        const clock = inline(inputs.clock!.value, "Clock") as unknown as Clock;
        assertClockIdentity(clock);
        const layout = inline(inputs.layout!.value, "StillVideoLayout") as unknown as StillVideoLayout;
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
        return { outputs: { request: { kind: "inline", value: canonicalize(request) } }, needs: {} };
      },
    },
    {
      producer: mediaOperationsProducers.bindStill,
      handler: ({ inputs }) => {
        const request = inline(inputs.request!.value, "StillVideoRequest") as unknown as StillVideoRequest;
        const source = blob(inputs.source!.value, "Still video source");
        const bound = bindStillVideoSource(request, source);
        return { outputs: { request: { kind: "inline", value: canonicalize(bound) } }, needs: {} };
      },
    },
    {
      producer: mediaOperationsProducers.renderStill,
      handler: ({ inputs }) => {
        const request = inline(inputs.request!.value, "StillVideoRequest") as unknown as StillVideoRequest;
        verifyStillVideoRequest(request);
        if (request.segments.some((segment) => segment.source === undefined)) {
          throw new Error("Still video has a segment without a picture");
        }
        const need: RenderStillVideoNeed = { request };
        return { outputs: {}, needs: { video: canonicalize(need) } };
      },
    },
    {
      producer: mediaOperationsProducers.planAudio,
      handler: ({ inputs }) => {
        const composition = inline(inputs.composition!.value, "Composition") as unknown as Composition;
        const timeline = inline(inputs.timeline!.value, "Timeline") as unknown as Timeline;
        return {
          outputs: { plan: { kind: "inline", value: canonicalize(compileAudioProgramPlan(composition, timeline)) } },
          needs: {},
        };
      },
    },
    {
      producer: mediaOperationsProducers.renderAudio,
      handler: ({ inputs }) => {
        const plan = inline(inputs.plan!.value, "AudioProgramPlan");
        verifyAudioProgramPlan(plan);
        const need: RenderAudioNeed = { plan };
        return { outputs: {}, needs: { audio: canonicalize(need) } };
      },
    },
    {
      producer: mediaOperationsProducers.renderAudioRange,
      handler: ({ inputs }) => {
        const plan = inline(inputs.plan!.value, "AudioProgramPlan");
        verifyAudioProgramPlan(plan);
        const range = inline(inputs.range!.value, "MediaFrameRange");
        verifyMediaFrameRange(range, plan.frameCount);
        const need: RenderAudioNeed = { plan, range };
        return { outputs: {}, needs: { audio: canonicalize(need) } };
      },
    },
    {
      producer: mediaOperationsProducers.mux,
      handler: ({ inputs }) => {
        const visual = inline(inputs.visual!.value, "TimelineVisual");
        const audio = inline(inputs.audio!.value, "TimelineAudio");
        verifyTimelineVisual(visual);
        verifyTimelineAudio(audio);
        const { sampleFrames } = mediaFrameRangeSamples(
          { startFrame: 0, endFrameExclusive: visual.frameCount }, visual.frameRate,
        );
        if (audio.sampleFrames !== sampleFrames) {
          throw new Error("Rendered visual and TimelineAudio have different presentation durations");
        }
        const need: MuxMediaNeed = { visual, audio };
        return { outputs: {}, needs: { media: canonicalize(need) } };
      },
    },
    {
      producer: mediaOperationsProducers.visualArtifact,
      handler: ({ inputs }) => {
        const visual = inline(inputs.visual!.value, "TimelineVisual");
        verifyTimelineVisual(visual);
        return { outputs: { artifact: visual.artifact }, needs: {} };
      },
    },
    {
      producer: mediaOperationsProducers.composite,
      handler: ({ inputs }) => {
        const under = blob(inputs.under!.value, "Composite under");
        const over = blob(inputs.over!.value, "Composite over");
        const need: CompositeMediaNeed = { under, over };
        return { outputs: {}, needs: { video: canonicalize(need) } };
      },
    },
    {
      producer: mediaOperationsProducers.projectMuxed,
      handler: ({ inputs }) => {
        const media = inline(inputs.media!.value, "MuxedMedia");
        verifyMuxedMedia(media);
        return {
          outputs: { video: media.artifact },
          needs: {},
        };
      },
    },
  ],
  plannedNeeds: [
    plannedMediaNeed(mediaOperationsProducers.inspect, "inspection", mediaOperationsCapabilities.inspect, { source: "media" }),
    plannedMediaNeed(mediaOperationsProducers.normalize, "media", mediaOperationsCapabilities.normalize, { source: "media" }),
    plannedMediaNeed(mediaOperationsProducers.transform, "video", mediaOperationsCapabilities.transform, { media: "video" }),
    plannedMediaNeed(mediaOperationsProducers.extractAudio, "audio", mediaOperationsCapabilities.extractAudio, { source: "audio" }),
    plannedMediaNeed(mediaOperationsProducers.extractFrame, "image", mediaOperationsCapabilities.extractFrame, { source: "video" }),
    plannedMediaNeed(mediaOperationsProducers.renderStill, "video", mediaOperationsCapabilities.renderStill, { request: "image" }),
    plannedMediaNeed(mediaOperationsProducers.renderAudio, "audio", mediaOperationsCapabilities.renderAudio, {}, presentAudioRender),
    plannedMediaNeed(mediaOperationsProducers.renderAudioRange, "audio", mediaOperationsCapabilities.renderAudio, {}, presentAudioRender),
    plannedMediaNeed(mediaOperationsProducers.mux, "media", mediaOperationsCapabilities.mux, { visual: "video", audio: "audio" }),
    plannedMediaNeed(mediaOperationsProducers.composite, "video", mediaOperationsCapabilities.composite, { under: "video", over: "video" }),
  ],
} satisfies ProducerPackage & AdmissionPackage;

/** Convenience set: public media validators must accompany the operation Producers. */
export const mediaOperationsComponents = [mediaComponent, mediaOperationsComponent] as const;
