import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/hypit/protocol";
import { mediaTypes } from "@hypit/media";
import { speechEvidenceTypes } from "@hypit/speech-evidence";

import { whisperXTranscriptionFragment } from "./fragment.js";
import { whisperXModuleRef, whisperXTypes } from "./manifest.js";
import { parseWhisperXLanguage } from "./types.js";

function literal(declaration: AuthorDeclaration, name: string): string {
  const value = declarationField(declaration, name);
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`WhisperX Transcription.${name} must be a non-empty literal.`);
  }
  return value.value.trim();
}

async function reference(
  declaration: AuthorDeclaration,
  name: string,
  expected: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`WhisperX Transcription.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, expected)) {
    throw new Error(`WhisperX Transcription.${name} has the wrong Type.`);
  }
  return value;
}

export const whisperXTranscriptionAuthorDeclaration: AuthorDeclarationCompiler = {
  module: whisperXModuleRef,
  declaration: "transcription",
  outputs: [whisperXTypes.language, speechEvidenceTypes.transcript],
  shape: {
    summary: "Transcribes prepared media into provider-neutral speech evidence.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names this transcription and its output." },
      { name: "media", kind: "reference", required: true, accepts: [mediaTypes.prepared],
        summary: "Selects the prepared media whose mapped audio is transcribed." },
      { name: "language", kind: "literal", required: true,
        summary: "Explicitly states the spoken language code." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: `${id}.transcript`, ref: { kind: "component-output", component: id, output: "transcript" },
      type: speechEvidenceTypes.transcript }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const media = await reference(declaration, "media", mediaTypes.prepared, resolveReference);
    const language = parseWhisperXLanguage(literal(declaration, "language"), "WhisperX Transcription.language");
    const languageId = `${id}.language`;
    return {
      records: [{ id: languageId, type: whisperXTypes.language,
        value: language as unknown as CanonicalValue, range: declaration.range }],
      components: [{ id, fragment: whisperXTranscriptionFragment,
        inputs: { media: media.ref, language: { kind: "record", id: languageId } },
        outputs: { transcript: `${id}.transcript` }, range: declaration.range }],
    };
  },
};

export const whisperXAuthorDeclarations = [whisperXTranscriptionAuthorDeclaration] as const;
export const whisperXMarkupDeclarations = [{ name: "transcription", tag: "Transcription" }] as const;
