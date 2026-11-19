import { timedTranscript } from "@hypit/timed-transcript";
import type { TimedTranscript, TimedTranscriptWord } from "@hypit/timed-transcript";

type RawWord = {
  readonly text?: unknown;
  readonly word?: unknown;
  readonly start?: unknown;
  readonly end?: unknown;
};

/** Common transcription response accepted from local WhisperX and remote transcription APIs. */
export type WhisperXTranscriptResponse = {
  readonly language?: unknown;
  readonly segments?: unknown;
  readonly word_segments?: unknown;
  readonly words?: unknown;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function word(rawValue: unknown): TimedTranscriptWord | undefined {
  assert(rawValue !== null && typeof rawValue === "object" && !Array.isArray(rawValue),
    "WhisperX response Word is invalid");
  const raw = rawValue as RawWord;
  const text = typeof raw.word === "string" ? raw.word.trim() : typeof raw.text === "string" ? raw.text.trim() : "";
  if (text.length === 0) return undefined;
  const hasTime = finite(raw.start) && finite(raw.end) && raw.start >= 0 && raw.start <= raw.end;
  return { word: text, ...(hasTime ? { start: raw.start, end: raw.end } : {}) };
}

function words(value: unknown): readonly TimedTranscriptWord[] {
  assert(Array.isArray(value), "WhisperX response has no Word array");
  return value.flatMap((item) => {
    const parsed = word(item);
    return parsed === undefined ? [] : [parsed];
  });
}

/** Preserve the service's word order and aligned seconds. */
export function interpretWhisperXTranscript(
  response: WhisperXTranscriptResponse,
  requestedLanguage?: string,
): TimedTranscript {
  const language = typeof response.language === "string" && response.language.trim().length > 0
    ? response.language
    : requestedLanguage;
  assert(language !== undefined && language.trim().length > 0, "WhisperX response has no language");
  const flat = response.word_segments ?? response.words;
  if (flat !== undefined) return timedTranscript(language, words(flat));
  assert(Array.isArray(response.segments), "WhisperX response has no word data");
  const aligned = response.segments.flatMap(item => {
    assert(item !== null && typeof item === "object" && !Array.isArray(item), "WhisperX response Segment is invalid");
    const segment = item as { readonly words?: unknown; readonly text?: unknown };
    if (segment.words === undefined && typeof segment.text === "string" && segment.text.trim() !== "") {
      throw new Error("WhisperX response Segment has text but no word data");
    }
    return segment.words === undefined ? [] : words(segment.words);
  });
  return timedTranscript(language, aligned);
}
