import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationCompiler,
} from "@hypit/hypit/author";
import { canonicalize } from "@hypit/hypit/protocol";

import { speechEvidenceModuleRef, speechEvidenceTypes } from "./contract.js";
import { decodeSpeechTranscriptEvidence } from "./transcript-document.js";

const recordId = /^[a-z][a-z0-9_-]{0,63}$/u;

function idOf(declaration: AuthorDeclaration): string {
  const value = declarationField(declaration, "id");
  if (value?.kind !== "literal" || !recordId.test(value.value)) {
    throw new Error("Speech Transcript.id must be a canonical lower-case identifier.");
  }
  return value.value;
}

export const speechTranscriptAuthorDeclaration: AuthorDeclarationCompiler = {
  module: speechEvidenceModuleRef,
  declaration: "transcript",
  outputs: [speechEvidenceTypes.transcript],
  shape: {
    summary: "Publishes editable provider-neutral speech transcript evidence.",
    fields: [{
      name: "id", kind: "identifier", required: true,
      summary: "Names the SpeechTranscriptEvidence value.",
    }],
    text: "Exact JSON evidence in the canonical 16 kHz sample domain.",
  },
  bindings(declaration) {
    const id = idOf(declaration);
    return [{ name: id, ref: { kind: "record", id }, type: speechEvidenceTypes.transcript }];
  },
  compile({ sourceName, declaration }) {
    const id = idOf(declaration);
    const evidence = decodeSpeechTranscriptEvidence(
      (declaration.text ?? "").trim(),
      `${sourceName} <Transcript>`,
    );
    return {
      records: [{
        id,
        type: speechEvidenceTypes.transcript,
        value: canonicalize(evidence),
        range: declaration.range,
      }],
      components: [],
    };
  },
};

export const speechTranscriptMarkupDeclaration = {
  name: "transcript",
  tag: "Transcript",
  body: "opaque",
} as const;
