import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import { preparedAudioSource, verifyPreparedMedia } from "@hypit/media";
import type { PreparedMedia } from "@hypit/media";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import {
  assertSpeechTranscriptEvidence,
  assertSpeechEvidenceAudioIdentity,
  speechEvidenceProducers,
  speechEvidenceSampleFrames,
  speechEvidenceTypes,
} from "./index.js";
import type { ProjectSpeechEvidenceAudioNeed, SpeechEvidenceAudio, SpeechTranscriptEvidence } from "./index.js";

function valueOf<T>(value: Value, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing.`);
  return value as T;
}

export const speechEvidenceComponent = {
  refinements: [
    { type: speechEvidenceTypes.audio,
      handler: ({ value }) => assertSpeechEvidenceAudioIdentity(valueOf<SpeechEvidenceAudio>(value, "SpeechEvidenceAudio")) },
    { type: speechEvidenceTypes.transcript,
      handler: ({ value }) => assertSpeechTranscriptEvidence(valueOf<SpeechTranscriptEvidence>(value, "SpeechTranscriptEvidence")) },
  ],
  producers: [{
    producer: speechEvidenceProducers.projectAudio,
    handler: ({ inputs }) => {
      const media = valueOf<PreparedMedia>(inputs.media!.value, "PreparedMedia");
      verifyPreparedMedia(media);
      if (media.audio === undefined) throw new Error("Speech evidence requires prepared audio");
      speechEvidenceSampleFrames(media.domain);
      const need: ProjectSpeechEvidenceAudioNeed = {
        source: preparedAudioSource(media),
        preparation: structuredClone(media.audio.map),
      };
      return { kind: "need", constraints: canonicalize(need) };
    },
  }],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
