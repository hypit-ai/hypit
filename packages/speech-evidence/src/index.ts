import { assertBlobRef } from "@hypit/hypit/protocol";
import { mediaDependency, mediaTypes } from "@hypit/media";
import type { BlobRef, CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import type { PreparedAudioSource } from "@hypit/media";
import { assertLocalTemporalDomain, resolveTemporalBoundary } from "@hypit/temporal";
import type { LocalTemporalDomain, TemporalMap } from "@hypit/temporal";
export {
  decodeSpeechTranscriptEvidence,
  decodeSpeechTranscriptSource,
  encodeSpeechTranscriptEvidence,
  phraseRanges,
  speechTranscriptSource,
  transcriptWordsFromEvidence,
  wordsAt,
} from "./transcript-document.js";
export type { FrameWords, TranscriptWord } from "./transcript-document.js";
export { decodeSpeechTranscriptSurface } from "./surface.js";

export type ProjectSpeechEvidenceAudioNeed = {
  readonly source: PreparedAudioSource;
  /** Prepared-local to selected source-presentation relation. */
  readonly preparation: TemporalMap;
};

export type SpeechEvidenceAudio = {
  readonly artifact: BlobRef;
  /** Exact 16 kHz mono PCM sample count. */
  readonly sampleFrames: number;
};

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
 * no authored Segment identity; assigning evidence to the explicitly connected
 * Script Segment belongs to the later deterministic Speech Alignment step.
 */
export type SpeechTranscriptPassage = {
  readonly startSample?: number;
  readonly endSampleExclusive?: number;
  readonly words: readonly SpeechWordEvidence[];
  readonly chars: readonly SpeechCharacterEvidence[];
  readonly speechActivity?: readonly SpeechActivitySpan[];
};

export type SpeechTranscriptEvidence = {
  readonly sampleFrames: number;
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

export const speechTranscriptEvidenceFields = {
  sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
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

export const speechTranscriptEvidenceSchema: ValueSchema = object(speechTranscriptEvidenceFields);
export const speechEvidenceModuleRef = { name: "@hypit/speech-evidence", version: "1" } as const;
export const speechEvidenceTypes = {
  audio: { module: speechEvidenceModuleRef, name: "SpeechEvidenceAudio" },
  transcript: { module: speechEvidenceModuleRef, name: "SpeechTranscriptEvidence" },
} satisfies Record<string, TypeRef>;
export const speechEvidenceCapabilities = {
  projectAudio: { module: speechEvidenceModuleRef, name: "project-speech-evidence-audio" },
} satisfies Record<string, CapabilityRef>;
export const speechEvidenceProducers = {
  projectAudio: { module: speechEvidenceModuleRef, name: "request-speech-evidence-audio" },
} satisfies Record<string, ProducerRef>;
export const speechEvidenceMarkupSurfaces = [{
  name: "transcript",
  tag: "Transcript",
  mode: "raw",
  outputs: [speechEvidenceTypes.transcript],
  vocabulary: {
    summary: "Publishes editable, provider-neutral speech transcript evidence in the canonical 16 kHz sample domain.",
    attributes: [{ name: "id", kind: "identifier", required: true,
      summary: "Names the SpeechTranscriptEvidence Record." }],
    text: "A JSON object containing exact sampleFrames and passages with words, characters, speech activity and optional scores.",
    ports: [{ name: "", type: speechEvidenceTypes.transcript,
      summary: "The complete editable SpeechTranscriptEvidence value." }],
    example: `<speech:Transcript id="opening">
{
  "sampleFrames": 160000,
  "passages": []
}
</speech:Transcript>`,
    notes: [
      "Sample boundaries are exact integers in a fixed 16 kHz mono audio domain; this Surface does not carry media, Provider or LocalTemporalDomain identity.",
      "Use the package serializer when materializing model output so text that could form Markup boundaries is Unicode-escaped.",
    ],
  },
}] as const;
export const speechEvidenceManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: speechEvidenceModuleRef.name,
  version: speechEvidenceModuleRef.version,
  dependencies: [mediaDependency],
  types: [speechEvidenceTypes.audio.name, speechEvidenceTypes.transcript.name],
  capabilities: [{ name: speechEvidenceCapabilities.projectAudio.name, returns: speechEvidenceTypes.audio }],
  producers: [{
    name: speechEvidenceProducers.projectAudio.name,
    inputs: [{ name: "media", type: mediaTypes.prepared }],
    result: { kind: "need" as const, name: "evidenceAudio", capability: speechEvidenceCapabilities.projectAudio },
  }],
};
export const speechEvidenceDependency = speechEvidenceModuleRef;

export function sealSpeechTranscriptEvidence(value: SpeechTranscriptEvidence): SpeechTranscriptEvidence {
  assertSpeechTranscriptEvidence(value);
  return structuredClone(value);
}

function assertExactFields(value: unknown, fields: readonly string[], subject: string): void {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${subject} is invalid.`);
  }
  const allowed = new Set(fields);
  const unexpected = Object.keys(value).find((field) => !allowed.has(field));
  if (unexpected !== undefined) throw new Error(`${subject} has unsupported field ${unexpected}.`);
}

export function speechEvidenceSampleFrames(domain: LocalTemporalDomain): number {
  assertLocalTemporalDomain(domain);
  const value = resolveTemporalBoundary(domain.duration,
    { frameRate: { numerator: 16_000, denominator: 1 } }, "nearest");
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Speech evidence sample domain is invalid.");
  return value;
}

export function sealSpeechEvidenceAudio(value: SpeechEvidenceAudio): SpeechEvidenceAudio {
  assertSpeechEvidenceAudioIdentity(value);
  return structuredClone(value);
}

export function assertSpeechEvidenceAudioIdentity(value: SpeechEvidenceAudio): void {
  assertExactFields(value, ["artifact", "sampleFrames"], "SpeechEvidenceAudio");
  assertBlobRef(value.artifact, "SpeechEvidenceAudio.artifact");
  if (value.artifact.mediaType !== "audio/wav"
    || !Number.isSafeInteger(value.sampleFrames) || value.sampleFrames < 1) {
    throw new Error("SpeechEvidenceAudio identity is invalid.");
  }
}

export function assertSpeechTranscriptEvidence(value: SpeechTranscriptEvidence): void {
  const item = value as SpeechTranscriptEvidence | null | undefined;
  assertExactFields(item, ["sampleFrames", "passages"], "SpeechTranscriptEvidence");
  if (item === null || item === undefined
    || !Number.isSafeInteger(item.sampleFrames) || item.sampleFrames < 1
    || !Array.isArray(item.passages)) {
    throw new Error("SpeechTranscriptEvidence is invalid.");
  }
  const window = (candidate: {
    readonly startSample?: number;
    readonly endSampleExclusive?: number;
  }): boolean => {
    if ((candidate.startSample === undefined) !== (candidate.endSampleExclusive === undefined)) return false;
    if (candidate.startSample === undefined || candidate.endSampleExclusive === undefined) return true;
    return Number.isSafeInteger(candidate.startSample)
      && Number.isSafeInteger(candidate.endSampleExclusive)
      && candidate.startSample >= 0
      && candidate.endSampleExclusive >= 0
      && candidate.startSample <= item.sampleFrames
      && candidate.endSampleExclusive <= item.sampleFrames;
  };
  const score = (candidate: number | undefined): boolean => candidate === undefined
    || (Number.isFinite(candidate) && candidate >= 0 && candidate <= 1);
  for (const passage of item.passages) {
    assertExactFields(passage, ["startSample", "endSampleExclusive", "words", "chars", "speechActivity"],
      "SpeechTranscriptEvidence passage");
    if (passage === null || typeof passage !== "object" || !window(passage)
      || !Array.isArray(passage.words) || !Array.isArray(passage.chars)
      || (passage.speechActivity !== undefined && !Array.isArray(passage.speechActivity))) {
      throw new Error("SpeechTranscriptEvidence passage is invalid.");
    }
    for (const word of passage.words) {
      assertExactFields(word, ["text", "startSample", "endSampleExclusive", "score"],
        "SpeechTranscriptEvidence word");
      if (word === null || typeof word !== "object" || typeof word.text !== "string"
        || !window(word) || !score(word.score)) {
        throw new Error("SpeechTranscriptEvidence word is invalid.");
      }
    }
    for (const character of passage.chars) {
      assertExactFields(character, ["char", "wordIndex", "startSample", "endSampleExclusive", "score"],
        "SpeechTranscriptEvidence character");
      if (character === null || typeof character !== "object" || typeof character.char !== "string"
        || !Number.isSafeInteger(character.wordIndex) || character.wordIndex < 0
        || character.wordIndex >= passage.words.length || !window(character) || !score(character.score)) {
        throw new Error("SpeechTranscriptEvidence character is invalid.");
      }
    }
    for (const activity of passage.speechActivity ?? []) {
      assertExactFields(activity, ["startSample", "endSampleExclusive"],
        "SpeechTranscriptEvidence speech activity");
      if (activity === null || typeof activity !== "object" || !window(activity)) {
        throw new Error("SpeechTranscriptEvidence speech activity is invalid.");
      }
    }
  }
}
