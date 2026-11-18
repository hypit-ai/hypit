import { timedTranscript } from "@hypit/timed-transcript";
import type { TimedTranscript, TimedTranscriptSegment, TimedTranscriptWord } from "@hypit/timed-transcript";

type RawWord = {
  readonly text?: unknown;
  readonly word?: unknown;
  readonly start?: unknown;
  readonly end?: unknown;
};

type RawSegment = {
  readonly text?: unknown;
  readonly start?: unknown;
  readonly end?: unknown;
  readonly words?: unknown;
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

function segment(rawValue: unknown): TimedTranscriptSegment | undefined {
  assert(rawValue !== null && typeof rawValue === "object" && !Array.isArray(rawValue),
    "WhisperX response Segment is invalid");
  const raw = rawValue as RawSegment;
  const aligned = raw.words === undefined ? [] : words(raw.words);
  if (aligned.length === 0) return undefined;
  const first = aligned.find((item) => item.start !== undefined);
  const last = aligned.findLast((item) => item.end !== undefined);
  const start = finite(raw.start) && raw.start >= 0 ? raw.start : first?.start;
  const end = finite(raw.end) && raw.end >= 0 ? raw.end : last?.end;
  assert(start !== undefined && end !== undefined && start <= end,
    "WhisperX response Segment has no valid time range");
  const text = typeof raw.text === "string" && raw.text.trim().length > 0
    ? raw.text.trim()
    : aligned.map((item) => item.word).join(" ");
  return { start, end, text, words: aligned };
}

/** Strip provider-specific fields once while preserving the aligned WhisperX seconds shape. */
export function interpretWhisperXTranscript(
  response: WhisperXTranscriptResponse,
  requestedLanguage?: string,
): TimedTranscript {
  const language = typeof response.language === "string" && response.language.trim().length > 0
    ? response.language
    : requestedLanguage;
  assert(language !== undefined && language.trim().length > 0, "WhisperX response has no language");
  if (Array.isArray(response.segments)) {
    const segments = response.segments.flatMap((item) => {
      const parsed = segment(item);
      return parsed === undefined ? [] : [parsed];
    });
    if (segments.length > 0 || (response.word_segments === undefined && response.words === undefined)) {
      return timedTranscript(language, segments);
    }
  }
  const flat = response.word_segments ?? response.words;
  assert(flat !== undefined, "WhisperX response has no Segment or Word array");
  const aligned = words(flat);
  if (aligned.length === 0) return timedTranscript(language, []);
  const first = aligned.find((item) => item.start !== undefined);
  const last = aligned.findLast((item) => item.end !== undefined);
  assert(first?.start !== undefined && last?.end !== undefined, "WhisperX response words have no valid time range");
  return timedTranscript(language, [{ start: first.start, end: last.end,
    text: aligned.map((item) => item.word).join(" "), words: aligned }]);
}
