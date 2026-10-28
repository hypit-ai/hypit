import type { AuthorAdopter } from "@hypit/hypit/author";
import { sameType, typeKey } from "@hypit/hypit/protocol";

import {
  speechEvidenceModuleRef,
  speechEvidenceTypes,
} from "./contract.js";
import { encodeSpeechTranscriptEvidence } from "./transcript-document.js";

const recordId = /^[a-z][a-z0-9_-]{0,63}$/u;

function adoptionId(parameters: unknown): string {
  if (parameters === null || Array.isArray(parameters) || typeof parameters !== "object") {
    throw new Error("Speech Transcript adoption parameters must contain id");
  }
  const fields = Object.keys(parameters);
  if (fields.length !== 1 || fields[0] !== "id") {
    throw new Error("Speech Transcript adoption parameters accept only id");
  }
  const id = (parameters as Readonly<Record<string, unknown>>).id;
  if (typeof id !== "string" || !recordId.test(id)) {
    throw new Error("Speech Transcript adoption id must be a canonical lower-case identifier");
  }
  return id;
}

export const speechTranscriptAuthorAdopter: AuthorAdopter = {
  ref: { module: speechEvidenceModuleRef, name: "transcript" },
  accepts: speechEvidenceTypes.transcript,
  adopt({ offer, parameters }) {
    if (!sameType(offer.type, speechEvidenceTypes.transcript)) {
      throw new Error(`Speech Transcript adopter accepts ${typeKey(speechEvidenceTypes.transcript)}, not ${typeKey(offer.type)}`);
    }
    const id = adoptionId(parameters);
    const evidence = offer.value as unknown as Parameters<typeof encodeSpeechTranscriptEvidence>[0];
    return {
      imports: [{ kind: "module", from: "@hypit/speech-evidence@1", alias: "speech" }],
      declarations: [{
        module: speechEvidenceModuleRef,
        name: "transcript",
        fields: [{ name: "id", value: { kind: "literal", value: id } }],
        children: [],
        text: encodeSpeechTranscriptEvidence(evidence),
      }],
      resources: [],
      result: id,
    };
  },
};
