import { alignTranscriptWords, type AlignedTranscriptWord, type TranscriptTimingSource, type TranscriptWindow } from "./alignment.js";

export type { AlignedTranscriptWord, TranscriptTimingSource, TranscriptWindow };

export type TimedTranscriptWord = {
  readonly word: string;
  readonly start?: number;
  readonly end?: number;
};

export type TimedTranscript = {
  readonly language: string;
  readonly words: readonly TimedTranscriptWord[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertFields(value: unknown, fields: readonly string[], subject: string): asserts value is Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object.`);
  assert(Object.keys(value).every(key => fields.includes(key)), `${subject} has an unknown field.`);
}

export function assertTimedTranscript(value: unknown): asserts value is TimedTranscript {
  assertFields(value, ["language", "words"], "TimedTranscript");
  assert(typeof value.language === "string" && value.language.trim().length > 0, "TimedTranscript language is invalid.");
  assert(Array.isArray(value.words), "TimedTranscript requires a word list.");
  for (const [index, entry] of value.words.entries()) {
    const subject = `TimedTranscript word ${index + 1}`;
    assertFields(entry, ["word", "start", "end"], subject);
    assert(typeof entry.word === "string" && entry.word.trim().length > 0, `${subject} requires text.`);
    if (!Object.hasOwn(entry, "start") && !Object.hasOwn(entry, "end")) continue;
    assert(typeof entry.start === "number" && Number.isFinite(entry.start) && typeof entry.end === "number"
      && Number.isFinite(entry.end) && entry.start >= 0 && entry.start <= entry.end, `${subject} requires a valid time range.`);
  }
}

export function timedTranscript(language: string, words: readonly TimedTranscriptWord[]): TimedTranscript {
  const value = { language: language.trim().toLowerCase(), words };
  assertTimedTranscript(value);
  return structuredClone(value);
}

export function encodeTimedTranscript(value: TimedTranscript): string {
  assertTimedTranscript(value);
  return JSON.stringify(value, null, 2) + "\n";
}

export function decodeTimedTranscript(text: string, subject = "timed transcript"): TimedTranscript {
  try {
    const value: unknown = JSON.parse(text);
    assertTimedTranscript(value);
    return value;
  } catch (error) {
    throw new Error(`Invalid ${subject}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

export type TranscriptAlignment = {
  readonly transcript: { readonly language: string; readonly words: readonly AlignedTranscriptWord[] };
  /** One entry per authored word. These describe the timing assignment, not recognition confidence. */
  readonly timingSources: readonly TranscriptTimingSource[];
};

/** Correct the wording and assign every authored word a range on the input audio clock. */
export function alignTranscript(input: {
  readonly transcript: TimedTranscript;
  readonly words: readonly string[];
  readonly window: TranscriptWindow;
}): TranscriptAlignment {
  assertTimedTranscript(input.transcript);
  const { words, timingSources } = alignTranscriptWords(input.words, input.transcript.words, input.window);
  return { transcript: { language: input.transcript.language, words }, timingSources };
}
