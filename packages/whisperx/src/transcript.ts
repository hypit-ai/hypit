import type { SpeechTranscriptPassage } from "@hypit/speech-evidence";

type RawWord = {
  readonly text?: unknown;
  readonly word?: unknown;
  readonly start?: unknown;
  readonly end?: unknown;
  readonly score?: unknown;
};

type RawSegment = {
  readonly start?: unknown;
  readonly end?: unknown;
  readonly words?: unknown;
};

/** Common transcription response accepted from local WhisperX and remote transcription APIs. */
export type WhisperXTranscriptResponse = {
  readonly language?: unknown;
  readonly segments?: unknown;
  readonly words?: unknown;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sampleWindow(
  startSec: unknown,
  endSec: unknown,
  sampleFrames: number,
): { readonly startSample: number; readonly endSampleExclusive: number } | undefined {
  if (!finite(startSec) || !finite(endSec) || startSec < 0 || endSec < startSec) return undefined;
  const startSample = Math.round(startSec * 16_000);
  const endSampleExclusive = Math.round(endSec * 16_000);
  if (!Number.isSafeInteger(startSample) || !Number.isSafeInteger(endSampleExclusive)
    || startSample > sampleFrames || endSampleExclusive > sampleFrames) return undefined;
  return { startSample, endSampleExclusive };
}

function words(value: unknown, sampleFrames: number): SpeechTranscriptPassage["words"] {
  assert(Array.isArray(value), "WhisperX response has no Word array");
  const result: Array<SpeechTranscriptPassage["words"][number]> = [];
  for (const rawValue of value) {
    assert(rawValue !== null && typeof rawValue === "object" && !Array.isArray(rawValue),
      "WhisperX response Word is invalid");
    const raw = rawValue as RawWord;
    const text = typeof raw.text === "string"
      ? raw.text.trim()
      : typeof raw.word === "string" ? raw.word.trim() : "";
    if (text.length === 0) continue;
    const window = sampleWindow(raw.start, raw.end, sampleFrames);
    const score = finite(raw.score) && raw.score >= 0 && raw.score <= 1 ? raw.score : undefined;
    result.push({ text, ...window, ...(score === undefined ? {} : { score }) });
  }
  return result;
}

/** Lower wire-level seconds once into exact 16 kHz evidence-sample boundaries. */
export function interpretWhisperXTranscript(
  response: WhisperXTranscriptResponse,
  sampleFrames: number,
): readonly SpeechTranscriptPassage[] {
  assert(Number.isSafeInteger(sampleFrames) && sampleFrames > 0,
    "WhisperX evidence sample count must be a positive integer");
  if (Array.isArray(response.segments)) {
    const passages = response.segments.map((rawValue): SpeechTranscriptPassage => {
      assert(rawValue !== null && typeof rawValue === "object" && !Array.isArray(rawValue),
        "WhisperX response Segment is invalid");
      const raw = rawValue as RawSegment;
      return {
        ...sampleWindow(raw.start, raw.end, sampleFrames),
        words: raw.words === undefined ? [] : words(raw.words, sampleFrames),
        chars: [],
      };
    });
    if (passages.some((passage) => passage.words.length > 0) || response.words === undefined) {
      return passages;
    }
  }
  if (response.words !== undefined) {
    const aligned = words(response.words, sampleFrames);
    const first = aligned.find((word) => word.startSample !== undefined);
    const last = [...aligned].reverse().find((word) => word.endSampleExclusive !== undefined);
    return [{
      ...(first?.startSample === undefined ? {} : { startSample: first.startSample }),
      ...(last?.endSampleExclusive === undefined ? {} : { endSampleExclusive: last.endSampleExclusive }),
      words: aligned,
      chars: [],
    }];
  }
  throw new Error("WhisperX response has no Segment or Word array");
}
