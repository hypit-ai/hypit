import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, TypeRef, ValueSchema } from "@narratage/protocol";

/** Exact boundaries in the fixed 16 kHz Speech Evidence Audio sample domain. */
export type SpeechWordEvidence = {
  readonly text: string;
  readonly startSample?: number;
  readonly endSampleExclusive?: number;
  readonly score?: number;
};

export type SpeechCharacterEvidence = {
  readonly char: string;
  /** Index into the containing passage's words. */
  readonly wordIndex: number;
  readonly startSample?: number;
  readonly endSampleExclusive?: number;
  readonly score?: number;
};

export type SpeechActivitySpan = {
  readonly startSample: number;
  readonly endSampleExclusive: number;
};

/**
 * One acoustic passage reported by the evidence provider. It deliberately has
 * no authored Segment identity; assigning evidence to Script Segments belongs
 * to Speech Alignment, where the connected SpeechAudioBasis is available.
 */
export type SpeechTranscriptPassage = {
  readonly startSample?: number;
  readonly endSampleExclusive?: number;
  readonly words: readonly SpeechWordEvidence[];
  readonly chars: readonly SpeechCharacterEvidence[];
  readonly speechActivity?: readonly SpeechActivitySpan[];
};

export type AlignedTranscriptEvidence = {
  readonly passages: readonly SpeechTranscriptPassage[];
};

const sample = { kind: "number", integer: true, minimum: 0 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const score = { kind: "number", minimum: 0, maximum: 1 } as const;
const object = (
  fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>,
): ValueSchema => ({ kind: "object", fields });

const word = object({
  text: { schema: { kind: "string" } },
  startSample: { schema: sample, optional: true },
  endSampleExclusive: { schema: sample, optional: true },
  score: { schema: score, optional: true },
});
const char = object({
  char: { schema: { kind: "string" } },
  wordIndex: { schema: integer },
  startSample: { schema: sample, optional: true },
  endSampleExclusive: { schema: sample, optional: true },
  score: { schema: score, optional: true },
});
const activity = object({
  startSample: { schema: sample },
  endSampleExclusive: { schema: sample },
});

export const alignedTranscriptEvidenceFields = {
  passages: {
    schema: {
      kind: "array",
      items: object({
        startSample: { schema: sample, optional: true },
        endSampleExclusive: { schema: sample, optional: true },
        words: { schema: { kind: "array", items: word } },
        chars: { schema: { kind: "array", items: char } },
        speechActivity: { schema: { kind: "array", items: activity }, optional: true },
      }),
    },
  },
} as const satisfies Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>;

export const alignedTranscriptEvidenceSchema: ValueSchema = object(alignedTranscriptEvidenceFields);
export const speechEvidenceModuleRef = { name: "@narratage/speech-evidence", version: "1" } as const;
export const speechEvidenceTypes = {
  alignedTranscript: { module: speechEvidenceModuleRef, name: "AlignedTranscriptEvidence" },
} satisfies Record<string, TypeRef>;
export const speechEvidenceManifest: ModuleManifest = {
  format: "narratage.module@1",
  name: speechEvidenceModuleRef.name,
  version: speechEvidenceModuleRef.version,
  dependencies: [],
  types: [{ name: speechEvidenceTypes.alignedTranscript.name }],
  capabilities: [],
  producers: [],
};
export const speechEvidenceDependency = {
  module: speechEvidenceModuleRef,
} as const;

export function sealAlignedTranscriptEvidence(value: AlignedTranscriptEvidence): AlignedTranscriptEvidence {
  return structuredClone(value);
}
