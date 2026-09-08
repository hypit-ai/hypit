import { readFile } from "node:fs/promises";

/** The seconds-based file written by `hypit transcribe`. Missing word times stay missing. */
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

export async function readTranscript(path: string): Promise<readonly TranscriptWord[]> {
  const raw = JSON.parse(await readFile(path, "utf8"));
  assert(raw?.format === "hypit.transcript@1" && Array.isArray(raw.passages), `${path}: expected hypit.transcript@1`);
  return raw.passages.flatMap((passage: { words?: unknown }) => {
    assert(passage !== null && Array.isArray(passage.words), `${path}: each passage needs words`);
    return passage.words.map((word: Record<string, unknown>) => {
      assert(word !== null && typeof word.text === "string", `${path}: each word needs text`);
      const start = word.start_seconds;
      const end = word.end_seconds;
      assert(start === undefined || (typeof start === "number" && Number.isFinite(start) && start >= 0), `${path}: invalid word start`);
      assert(end === undefined || (typeof end === "number" && Number.isFinite(end) && end >= 0), `${path}: invalid word end`);
      assert(start === undefined || end === undefined || end >= start, `${path}: word end precedes start`);
      return { text: word.text, ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) };
    });
  });
}

export function wordsAt(words: readonly TranscriptWord[], at: number): FrameWords {
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
  return { active, context: anchor < 0 ? [] : words.slice(Math.max(0, anchor - 3), last + 4) };
}

function searchable(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, "");
}

/** Find whole, consecutive transcript words; punctuation and case do not affect matching. */
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
      assert(start !== undefined && end !== undefined, `The phrase ${JSON.stringify(text)} has missing boundary times; inspect its passage and choose --start/--end`);
      matches.push({ start, end });
    }
  }
  return matches;
}
