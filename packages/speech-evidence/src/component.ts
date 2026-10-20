import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import { synchronizedMediaSampleFrames, verifySynchronizedMedia } from "@hypit/media";
import type { SynchronizedMedia } from "@hypit/media";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import { assertLocalTemporalDomain } from "@hypit/temporal";
import type { LocalTemporalDomain } from "@hypit/temporal";

import {
  assertAlignedTranscriptEvidenceIdentity,
  assertSpeechEvidenceAudioIdentity,
  speechEvidenceProducers,
  speechEvidenceSampleBoundary,
  speechEvidenceTypes,
} from "./index.js";
import type { AlignedTranscriptEvidence, ProjectSpeechEvidenceAudioNeed, SpeechEvidenceAudio } from "./index.js";

function valueOf<T>(value: Value, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing.`);
  return value as T;
}

export const speechEvidenceComponent = {
  refinements: [
    { type: speechEvidenceTypes.audio,
      handler: ({ value }) => assertSpeechEvidenceAudioIdentity(valueOf<SpeechEvidenceAudio>(value, "SpeechEvidenceAudio")) },
    { type: speechEvidenceTypes.alignedTranscript,
      handler: ({ value }) => assertAlignedTranscriptEvidenceIdentity(valueOf<AlignedTranscriptEvidence>(value, "AlignedTranscriptEvidence")) },
  ],
  producers: [{
    producer: speechEvidenceProducers.projectAudio,
    handler: ({ inputs }) => {
      const media = valueOf<SynchronizedMedia>(inputs.media!.value, "SynchronizedMedia");
      const domain = valueOf<LocalTemporalDomain>(inputs.domain!.value, "LocalTemporalDomain");
      verifySynchronizedMedia(media);
      assertLocalTemporalDomain(domain);
      if (domain.frameCount !== media.frameDomain.frameCount
        || domain.frameRate.numerator !== media.frameDomain.frameRate.numerator
        || domain.frameRate.denominator !== media.frameDomain.frameRate.denominator) {
        throw new Error(`Speech evidence domain ${domain.id} does not describe its normalized media`);
      }
      if (media.audio === undefined) throw new Error("Speech evidence requires normalized media audio");
      const sourceSampleFrames = synchronizedMediaSampleFrames(media);
      const evidenceSampleFrames = speechEvidenceSampleBoundary(sourceSampleFrames);
      if (!Number.isSafeInteger(sourceSampleFrames) || sourceSampleFrames < 1
        || !Number.isSafeInteger(evidenceSampleFrames) || evidenceSampleFrames < 1) {
        throw new Error("Speech evidence audio sample domain is invalid");
      }
      const need: ProjectSpeechEvidenceAudioNeed = {
        domainId: domain.id,
        source: media.audio.artifact,
        sourceSampleFrames,
        evidenceSampleFrames,
      };
      return { kind: "need", constraints: canonicalize(need) };
    },
  }],
} satisfies ProducerPackage & RefinementPackage;
