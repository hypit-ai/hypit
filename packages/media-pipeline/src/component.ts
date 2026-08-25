import { mediaComponent } from "@hypit/media";
import type { ComponentPackage } from "@hypit/component-kit";
import { synchronizedMediaSampleFrames, verifyMediaInspection, verifyMediaStreamSelection, verifyMuxedMedia, verifyRenderedVisual, verifySynchronizedMedia, verifyTimelineAudio } from "@hypit/media";
import type { MediaInspection, MediaStreamSelection, MuxedMedia, RenderedVisual, SynchronizedMedia, TimelineAudio } from "@hypit/media";
import { assertProgramClockIdentity } from "@hypit/program-space";
import type { ProgramClock, ProgramSpace } from "@hypit/program-space";
import { assertSpeechDurationIdentity, speechEvidenceSampleBoundary } from "@hypit/speech";
import type { SpeechDuration } from "@hypit/speech";
import type { Composition } from "@hypit/composition";
import type { BlobRef, CanonicalValue, StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";

import {
  compileAudioProgramPlan,
  verifyAudioProgramPlan,
} from "./audio-plan.js";
import { mediaPipelineProducers, mediaPipelineTypes } from "./manifest.js";
import {
  selectMediaStreams,
  verifyMediaSelectionRequest,
} from "./selection.js";
import {
  selectAudioStream,
  selectVideoStream,
  sealStillVideoRequest,
  verifyAudioExtractionRequest,
  verifyFrameExtractionRequest,
  verifyMediaTransformProgram,
  verifyStillVideoRequest,
} from "./operations.js";
import type {
  AudioExtractionRequest,
  ExtractAudioNeed,
  ExtractFrameNeed,
  FrameExtractionRequest,
  InspectMediaNeed,
  MuxMediaNeed,
  MediaSelectionRequest,
  NormalizeMediaNeed,
  ProjectSpeechEvidenceAudioNeed,
  RenderAudioNeed,
  RenderStillVideoNeed,
  StillVideoRequest,
  TransformMediaNeed,
} from "./types.js";

function inline(value: StoredValue, subject: string): CanonicalValue {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}

function blob(value: StoredValue, subject: string): BlobRef {
  if (value.kind !== "blob") throw new Error(`${subject} must be a BlobArtifact`);
  return value;
}

export const mediaPipelineComponent = {
  validators: [
    {
      type: mediaPipelineTypes.selectionRequest,
      handler: ({ value }) => {
        verifyMediaSelectionRequest(inline(value, "MediaSelectionRequest"));
      },
    },
    {
      type: mediaPipelineTypes.audioProgramPlan,
      handler: ({ value }) => {
        verifyAudioProgramPlan(inline(value, "AudioProgramPlan"));
      },
    },
    {
      type: mediaPipelineTypes.transformProgram,
      handler: ({ value }) => {
        verifyMediaTransformProgram(inline(value, "MediaTransformProgram"));
      },
    },
    {
      type: mediaPipelineTypes.audioExtractionRequest,
      handler: ({ value }) => {
        verifyAudioExtractionRequest(inline(value, "AudioExtractionRequest"));
      },
    },
    {
      type: mediaPipelineTypes.frameExtractionRequest,
      handler: ({ value }) => {
        verifyFrameExtractionRequest(inline(value, "FrameExtractionRequest"));
      },
    },
    {
      type: mediaPipelineTypes.stillVideoRequest,
      handler: ({ value }) => {
        verifyStillVideoRequest(inline(value, "StillVideoRequest"));
      },
    },
  ],
  producers: [
    {
      producer: mediaPipelineProducers.inspect,
      handler: ({ inputs }) => {
        const source = blob(inputs.source!.value, "Media inspection source");
        const need: InspectMediaNeed = { source };
        return { outputs: {}, needs: { inspection: canonicalize(need) } };
      },
    },
    {
      producer: mediaPipelineProducers.select,
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
      producer: mediaPipelineProducers.normalize,
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
      producer: mediaPipelineProducers.transform,
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
      producer: mediaPipelineProducers.extractAudio,
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
      producer: mediaPipelineProducers.extractFrame,
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
      producer: mediaPipelineProducers.planStill,
      handler: ({ inputs }) => {
        const duration = inline(inputs.duration!.value, "SpeechDuration") as unknown as SpeechDuration;
        const clock = inline(inputs.clock!.value, "ProgramClock") as unknown as ProgramClock;
        assertSpeechDurationIdentity(duration);
        assertProgramClockIdentity(clock);
        const frames = Math.round(duration * clock.frameRate.numerator / clock.frameRate.denominator);
        if (!Number.isSafeInteger(frames) || frames < 1) {
          throw new Error("Still video duration does not produce a positive safe frame count");
        }
        const request = sealStillVideoRequest({
          frameRate: clock.frameRate,
          frameCount: frames,
          output: { container: "mp4", codec: "h264", pixelFormat: "yuv420p" },
        });
        return { outputs: { request: { kind: "inline", value: canonicalize(request) } }, needs: {} };
      },
    },
    {
      producer: mediaPipelineProducers.renderStill,
      handler: ({ inputs }) => {
        const source = blob(inputs.source!.value, "Still video source");
        const request = inline(inputs.request!.value, "StillVideoRequest") as unknown as StillVideoRequest;
        if (!source.mediaType.startsWith("image/")) throw new Error("Still video source must be an image Artifact");
        verifyStillVideoRequest(request);
        const need: RenderStillVideoNeed = { source, request };
        return { outputs: {}, needs: { video: canonicalize(need) } };
      },
    },
    {
      producer: mediaPipelineProducers.projectSpeechEvidenceAudio,
      handler: ({ inputs }) => {
        const media = inline(inputs.media!.value, "SynchronizedMedia") as unknown as SynchronizedMedia;
        verifySynchronizedMedia(media);
        if (media.audio === undefined) throw new Error("Speech evidence requires normalized Take audio");
        const sourceSampleFrames = synchronizedMediaSampleFrames(media);
        const evidenceSampleFrames = speechEvidenceSampleBoundary(sourceSampleFrames);
        if (!Number.isSafeInteger(sourceSampleFrames) || sourceSampleFrames < 1
          || !Number.isSafeInteger(evidenceSampleFrames) || evidenceSampleFrames < 1) {
          throw new Error("Speech evidence audio sample domain is invalid");
        }
        const need: ProjectSpeechEvidenceAudioNeed = {
          source: media.audio.artifact,
          sourceSampleFrames,
          evidenceSampleFrames,
        };
        return { outputs: {}, needs: { evidenceAudio: canonicalize(need) } };
      },
    },
    {
      producer: mediaPipelineProducers.planAudio,
      handler: ({ inputs }) => {
        const composition = inline(inputs.composition!.value, "Composition") as unknown as Composition;
        const space = inline(inputs.space!.value, "ProgramSpace") as unknown as ProgramSpace;
        return {
          outputs: { plan: { kind: "inline", value: canonicalize(compileAudioProgramPlan(composition, space)) } },
          needs: {},
        };
      },
    },
    {
      producer: mediaPipelineProducers.renderAudio,
      handler: ({ inputs }) => {
        const plan = inline(inputs.plan!.value, "AudioProgramPlan");
        verifyAudioProgramPlan(plan);
        const need: RenderAudioNeed = { plan };
        return { outputs: {}, needs: { audio: canonicalize(need) } };
      },
    },
    {
      producer: mediaPipelineProducers.mux,
      handler: ({ inputs }) => {
        const visual = inline(inputs.visual!.value, "RenderedVisual");
        const audio = inline(inputs.audio!.value, "TimelineAudio");
        verifyRenderedVisual(visual);
        verifyTimelineAudio(audio);
        if (visual.frameCount * visual.frameRate.denominator * 48_000
          !== audio.sampleFrames * visual.frameRate.numerator) {
          throw new Error("Rendered visual and TimelineAudio have different presentation durations");
        }
        const need: MuxMediaNeed = { visual, audio };
        return { outputs: {}, needs: { media: canonicalize(need) } };
      },
    },
    {
      producer: mediaPipelineProducers.projectMuxed,
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
} satisfies ComponentPackage;

/** Convenience set: public media validators must accompany the pipeline Producers. */
export const mediaPipelineComponents = [mediaComponent, mediaPipelineComponent] as const;
