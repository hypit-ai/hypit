import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, TypeRef, ValueSchema } from "@narratage/protocol";
export type SpeechWordEvidence = { readonly text: string; readonly startSec?: number; readonly endSec?: number; readonly score?: number };
export type SpeechCharacterEvidence = { readonly char: string; readonly wordIndex: number; readonly startSec?: number; readonly endSec?: number; readonly score?: number };
export type SpeechActivitySpan = { readonly startSec: number; readonly endSec: number };
export type AlignedTranscriptSegment = { readonly sourceSegmentId: string;
  readonly words: readonly SpeechWordEvidence[]; readonly chars: readonly SpeechCharacterEvidence[]; readonly speechActivity?: readonly SpeechActivitySpan[] };
export type AlignedTranscriptEvidence = { readonly contract: "svml.aligned-transcript-evidence@1"; readonly segments: readonly AlignedTranscriptSegment[] };
const string = { kind: "string", minLength: 1 } as const; const number = { kind: "number", minimum: 0 } as const; const integer = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const word = object({ text: { schema: { kind: "string" } }, startSec: { schema: number, optional: true }, endSec: { schema: number, optional: true }, score: { schema: { kind: "number", minimum: 0, maximum: 1 }, optional: true } });
const char = object({ char: { schema: { kind: "string" } }, wordIndex: { schema: integer }, startSec: { schema: number, optional: true }, endSec: { schema: number, optional: true }, score: { schema: { kind: "number", minimum: 0, maximum: 1 }, optional: true } });
export const alignedTranscriptEvidenceFields = {
  contract: { schema: { kind: "literal", value: "svml.aligned-transcript-evidence@1" } },
  segments: { schema: { kind: "array", minItems: 1, items: object({ sourceSegmentId: { schema: string },
    words: { schema: { kind: "array", items: word } }, chars: { schema: { kind: "array", items: char } },
    speechActivity: { schema: { kind: "array", items: object({ startSec: { schema: number }, endSec: { schema: number } }) }, optional: true } }) } },
} as const satisfies Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>;
export const alignedTranscriptEvidenceSchema: ValueSchema = object(alignedTranscriptEvidenceFields);
export const speechEvidenceModuleRef = { name: "@narratage/speech-evidence", version: "1" } as const;
export const speechEvidenceTypes = { alignedTranscript: { module: speechEvidenceModuleRef, name: "AlignedTranscriptEvidence" } } satisfies Record<string, TypeRef>;
export const speechEvidenceManifest: ModuleManifest = { format: "svml.module@1", name: speechEvidenceModuleRef.name, version: speechEvidenceModuleRef.version,
  dependencies: [], types: [{ name: speechEvidenceTypes.alignedTranscript.name, schema: alignedTranscriptEvidenceSchema }], capabilities: [], producers: [] };
export const speechEvidenceManifestDigest = digestOf(speechEvidenceManifest);
export const speechEvidenceDependency = { module: speechEvidenceModuleRef, digest: speechEvidenceManifestDigest } as const;
export function sealAlignedTranscriptEvidence(value: AlignedTranscriptEvidence): AlignedTranscriptEvidence { return structuredClone(value); }
