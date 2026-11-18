export type TimedTranscriptWord = {
  readonly word: string;
  readonly start?: number;
  readonly end?: number;
};

export type TimedTranscriptSegment = {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly words: readonly TimedTranscriptWord[];
};

/** The editable aligned transcript stored beside media. Times are seconds in the bound media domain. */
export type TimedTranscript = {
  readonly language: string;
  readonly segments: readonly TimedTranscriptSegment[];
  readonly word_segments: readonly TimedTranscriptWord[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertExactFields(value: unknown, fields: readonly string[], subject: string): asserts value is Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} is invalid.`);
  const allowed = new Set(fields);
  const unexpected = Object.keys(value).find((field) => !allowed.has(field));
  assert(unexpected === undefined, `${subject} has unsupported field ${unexpected}.`);
}

function assertTime(value: unknown, subject: string): asserts value is number {
  assert(typeof value === "number" && Number.isFinite(value) && value >= 0, `${subject} is invalid.`);
}

function assertWord(value: unknown, subject: string): asserts value is TimedTranscriptWord {
  assertExactFields(value, ["word", "start", "end"], subject);
  assert(typeof value.word === "string" && value.word.trim().length > 0, `${subject} is invalid.`);
  assert((value.start === undefined) === (value.end === undefined), `${subject} has a partial time range.`);
  if (value.start !== undefined) {
    assertTime(value.start, `${subject}.start`);
    assertTime(value.end, `${subject}.end`);
    assert(value.start <= value.end, `${subject} time range is reversed.`);
  }
}

export function assertTimedTranscript(value: unknown): asserts value is TimedTranscript {
  assertExactFields(value, ["language", "segments", "word_segments"], "TimedTranscript");
  assert(typeof value.language === "string" && value.language.trim().length > 0, "TimedTranscript language is invalid.");
  assert(Array.isArray(value.segments) && Array.isArray(value.word_segments), "TimedTranscript arrays are invalid.");
  const flattened: TimedTranscriptWord[] = [];
  for (const [index, segment] of value.segments.entries()) {
    const subject = `TimedTranscript segment ${index}`;
    assertExactFields(segment, ["start", "end", "text", "words"], subject);
    assertTime(segment.start, `${subject}.start`);
    assertTime(segment.end, `${subject}.end`);
    assert(segment.start <= segment.end && typeof segment.text === "string" && Array.isArray(segment.words), `${subject} is invalid.`);
    for (const [wordIndex, word] of segment.words.entries()) {
      assertWord(word, `${subject} word ${wordIndex}`);
      if (word.start !== undefined) {
        assert(segment.start <= word.start && word.end! <= segment.end, `${subject} word ${wordIndex} lies outside its segment.`);
      }
      flattened.push(word);
    }
  }
  for (const [index, word] of value.word_segments.entries()) assertWord(word, `TimedTranscript word_segments ${index}`);
  assert(JSON.stringify(value.word_segments) === JSON.stringify(flattened),
    "TimedTranscript word_segments must equal the words flattened from segments.");
}

export function sealTimedTranscript(value: TimedTranscript): TimedTranscript {
  assertTimedTranscript(value);
  return structuredClone(value);
}

export function timedTranscript(
  language: string,
  segments: readonly TimedTranscriptSegment[],
): TimedTranscript {
  return sealTimedTranscript({ language: language.trim().toLowerCase(), segments, word_segments: segments.flatMap((segment) => segment.words) });
}

export function encodeTimedTranscript(value: TimedTranscript): string {
  assertTimedTranscript(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function decodeTimedTranscript(text: string, subject = "timed transcript"): TimedTranscript {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (error) { throw new Error(`${subject}: ${error instanceof Error ? error.message : "invalid JSON"}`); }
  try { assertTimedTranscript(value); return structuredClone(value); }
  catch (error) { throw new Error(`${subject}: ${error instanceof Error ? error.message : "invalid transcript"}`); }
}
