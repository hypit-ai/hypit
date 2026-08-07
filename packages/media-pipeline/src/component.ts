import type { ComponentPackage } from "@narratage/component-kit";
import {
  mediaContractsComponent,
  assertSpeechAudioBasisIdentity,
  speechEvidenceSampleBoundary,
  programSpaceSampleFrames,
  verifyMuxedMedia,
  verifyMediaInspection,
  verifyMediaStreamSelection,
  verifyRenderedVisual,
  verifyTimelineAudio,
} from "@narratage/contracts";
import type {
  Composition,
  MuxedMedia,
  ProgramSpace,
  RenderedVisual,
  SpeechAudioBasis,
  TimelineAudio,
} from "@narratage/contracts";
import type { BlobRef, CanonicalValue, StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

import {
  compileAudioProgramPlan,
  verifyAudioProgramPlan,
} from "./audio-plan.js";
import {
  mediaPipelineImplementationDigests,
  mediaPipelineProducers,
  mediaPipelineTypes,
} from "./manifest.js";
import {
  selectMediaStreams,
  verifyMediaSelectionRequest,
} from "./selection.js";
import type {
  InspectMediaNeed,
  MuxMediaNeed,
  MediaSelectionRequest,
  NormalizeMediaNeed,
  ProjectSpeechEvidenceAudioNeed,
  RenderAudioNeed,
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
  name: "@narratage/media-pipeline",
  validators: [
    {
      type: mediaPipelineTypes.selectionRequest,
      implementationDigest: mediaPipelineImplementationDigests.requestValidator,
      handler: ({ value }) => {
        verifyMediaSelectionRequest(inline(value, "MediaSelectionRequest"));
      },
    },
    {
      type: mediaPipelineTypes.audioProgramPlan,
      implementationDigest: mediaPipelineImplementationDigests.audioPlanValidator,
      handler: ({ value }) => {
        verifyAudioProgramPlan(inline(value, "AudioProgramPlan"));
      },
    },
  ],
  producers: [
    {
      producer: mediaPipelineProducers.inspect,
      implementationDigest: mediaPipelineImplementationDigests.inspect,
      handler: ({ inputs }) => {
        const source = blob(inputs.source!.value, "Media inspection source");
        const need: InspectMediaNeed = { contract: "svml.inspect-media-request@1", source };
        return { outputs: {}, needs: { inspection: canonicalize(need) } };
      },
    },
    {
      producer: mediaPipelineProducers.select,
      implementationDigest: mediaPipelineImplementationDigests.select,
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
      implementationDigest: mediaPipelineImplementationDigests.normalize,
      handler: ({ inputs }) => {
        const source = blob(inputs.source!.value, "Media normalization source");
        const inspection = inline(inputs.inspection!.value, "MediaInspection");
        const selection = inline(inputs.selection!.value, "MediaStreamSelection");
        const request = inline(inputs.request!.value, "MediaSelectionRequest");
        verifyMediaInspection(inspection);
        verifyMediaStreamSelection(selection);
        verifyMediaSelectionRequest(request);
        const need: NormalizeMediaNeed = {
          contract: "svml.normalize-media-request@1",
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
      producer: mediaPipelineProducers.projectSpeechEvidenceAudio,
      implementationDigest: mediaPipelineImplementationDigests.projectSpeechEvidenceAudio,
      handler: ({ inputs }) => {
        const audio = inline(inputs.audio!.value, "SpeechAudioBasis") as unknown as SpeechAudioBasis;
        assertSpeechAudioBasisIdentity(audio);
        const sourceSampleFrames = programSpaceSampleFrames(audio.programSpace, 48_000);
        const evidenceSampleFrames = speechEvidenceSampleBoundary(sourceSampleFrames);
        if (!Number.isSafeInteger(sourceSampleFrames) || sourceSampleFrames < 1
          || !Number.isSafeInteger(evidenceSampleFrames) || evidenceSampleFrames < 1) {
          throw new Error("Speech evidence audio sample domain is invalid");
        }
        const need: ProjectSpeechEvidenceAudioNeed = {
          contract: "svml.project-speech-evidence-audio-request@1",
          source: {
            kind: "blob",
            digest: audio.audio.digest,
            size: audio.audio.size,
            mediaType: audio.audio.mediaType,
          },
          sourceSampleRate: 48_000,
          sourceChannels: 2,
          sourceCodec: "pcm_s16le",
          sourceSampleFrames,
          evidenceSampleRate: 16_000,
          evidenceChannels: 1,
          evidenceCodec: "pcm_s16le",
          evidenceSampleFrames,
          durationSec: audio.programSpace.durationSec,
          segments: audio.segments,
        };
        return { outputs: {}, needs: { evidenceAudio: canonicalize(need) } };
      },
    },
    {
      producer: mediaPipelineProducers.planAudio,
      implementationDigest: mediaPipelineImplementationDigests.planAudio,
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
      implementationDigest: mediaPipelineImplementationDigests.renderAudio,
      handler: ({ inputs }) => {
        const plan = inline(inputs.plan!.value, "AudioProgramPlan");
        verifyAudioProgramPlan(plan);
        const need: RenderAudioNeed = { contract: "svml.render-audio-request@1", plan };
        return { outputs: {}, needs: { audio: canonicalize(need) } };
      },
    },
    {
      producer: mediaPipelineProducers.mux,
      implementationDigest: mediaPipelineImplementationDigests.mux,
      handler: ({ inputs }) => {
        const visual = inline(inputs.visual!.value, "RenderedVisual");
        const audio = inline(inputs.audio!.value, "TimelineAudio");
        verifyRenderedVisual(visual);
        verifyTimelineAudio(audio);
        if (visual.frameCount * visual.frameRate.denominator * 48_000
          !== audio.sampleFrames * visual.frameRate.numerator) {
          throw new Error("Rendered visual and TimelineAudio have different presentation durations");
        }
        const need: MuxMediaNeed = { contract: "svml.mux-media-request@1", visual, audio };
        return { outputs: {}, needs: { media: canonicalize(need) } };
      },
    },
    {
      producer: mediaPipelineProducers.projectMuxed,
      implementationDigest: mediaPipelineImplementationDigests.projectMuxed,
      handler: ({ inputs }) => {
        const media = inline(inputs.media!.value, "MuxedMedia");
        verifyMuxedMedia(media);
        const durationSec = media.frameCount * media.frameRate.denominator / media.frameRate.numerator;
        return {
          outputs: {
            video: {
              kind: "inline",
              value: canonicalize({
                digest: media.artifact.digest,
                size: media.artifact.size,
                mediaType: media.artifact.mediaType,
                durationSec,
              }),
            },
          },
          needs: {},
        };
      },
    },
  ],
} satisfies ComponentPackage;

/** Convenience set: public media validators must accompany the pipeline Producers. */
export const mediaPipelineComponents = [mediaContractsComponent, mediaPipelineComponent] as const;
