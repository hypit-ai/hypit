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

export type TranscriptWord = {
  readonly text: string;
  readonly start?: number;
  readonly end?: number;
};

export type FrameWords = {
  readonly active: readonly TranscriptWord[];
  readonly context: readonly TranscriptWord[];
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

export function transcriptWords(value: TimedTranscript): readonly TranscriptWord[] {
  assertTimedTranscript(value);
  return value.word_segments.map(({ word, start, end }) => ({
    text: word,
    ...(start === undefined ? {} : { start, end }),
  }));
}

export function wordsAt(words: readonly TranscriptWord[], at: number, contextWords = 3): FrameWords {
  assert(Number.isSafeInteger(contextWords) && contextWords >= 0, "word context must be a non-negative whole number");
  const active = words.filter((word) => word.start !== undefined && word.end !== undefined && word.start <= at && at < word.end);
  let anchor = active.length > 0 ? words.indexOf(active[0]!) : -1;
  if (anchor < 0) {
    let distance = Infinity;
    for (const [index, word] of words.entries()) {
      const time = word.start ?? word.end;
      if (time !== undefined && Math.abs(time - at) < distance) { anchor = index; distance = Math.abs(time - at); }
    }
  }
  const last = active.length > 0 ? words.indexOf(active.at(-1)!) : anchor;
  return { active, context: anchor < 0 ? [] : words.slice(Math.max(0, anchor - contextWords), last + contextWords + 1) };
}

function searchable(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, "");
}

export function phraseRanges(words: readonly TranscriptWord[], text: string): readonly { start: number; end: number }[] {
  const query = searchable(text);
  assert(query.length > 0, "--around needs a word or phrase");
  const matches: { start: number; end: number }[] = [];
  for (let first = 0; first < words.length; first += 1) {
    if (searchable(words[first]!.text).length === 0) continue;
    let joined = "";
    for (let last = first; last < words.length && joined.length < query.length; last += 1) {
      joined += searchable(words[last]!.text);
      if (joined !== query) continue;
      const start = words[first]!.start;
      const end = words[last]!.end;
      assert(start !== undefined && end !== undefined,
        `The phrase ${JSON.stringify(text)} has missing boundary times; inspect its segment and choose --start/--end`);
      matches.push({ start, end });
    }
  }
  return matches;
}
