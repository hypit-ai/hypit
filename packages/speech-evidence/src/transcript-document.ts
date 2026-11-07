import {
  assertSpeechTranscriptEvidence,
  sealSpeechTranscriptEvidence,
} from "./index.js";
import type { SpeechTranscriptEvidence } from "./index.js";

/** A seconds projection of speech evidence for author inspection. Missing times stay missing. */
export type TranscriptWord = {
  readonly text: string;
  readonly start?: number;
  readonly end?: number;
};
export type FrameWords = {
  readonly active: readonly TranscriptWord[];
  readonly context: readonly TranscriptWord[];
};

const SAMPLE_RATE = 16_000;
const seconds = (sample: number | undefined): number | undefined =>
  sample === undefined ? undefined : sample / SAMPLE_RATE;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Encode one complete provider-neutral evidence file. */
export function encodeSpeechTranscriptEvidence(evidence: SpeechTranscriptEvidence): string {
  assertSpeechTranscriptEvidence(evidence);
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

/** Decode one complete provider-neutral evidence file. */
export function decodeSpeechTranscriptEvidence(
  text: string,
  subject = "speech transcript evidence",
): SpeechTranscriptEvidence {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (error) {
    throw new Error(`${subject}: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
  try { return sealSpeechTranscriptEvidence(value as SpeechTranscriptEvidence); }
  catch (error) {
    throw new Error(`${subject}: ${error instanceof Error ? error.message : "invalid evidence"}`);
  }
}

/** Project exact sample evidence into the seconds view consumed by author tools. */
export function transcriptWordsFromEvidence(
  evidence: SpeechTranscriptEvidence,
): readonly TranscriptWord[] {
  assertSpeechTranscriptEvidence(evidence);
  return evidence.passages.flatMap((passage) => passage.words.map((word): TranscriptWord => {
    const start = seconds(word.startSample);
    const end = seconds(word.endSampleExclusive);
    return {
      text: word.text,
      ...(start === undefined ? {} : { start }),
      ...(end === undefined ? {} : { end }),
    };
  }));
}

export function wordsAt(words: readonly TranscriptWord[], at: number, contextWords = 3): FrameWords {
  assert(Number.isSafeInteger(contextWords) && contextWords >= 0, "word context must be a non-negative whole number");
  const active = words.filter((word) => word.start !== undefined && word.end !== undefined
    && word.start <= at && at < word.end);
  let anchor = active.length > 0 ? words.indexOf(active[0]!) : -1;
  if (anchor < 0) {
    let distance = Infinity;
    for (const [index, word] of words.entries()) {
      const time = word.start ?? word.end;
      if (time !== undefined && Math.abs(time - at) < distance) {
        anchor = index;
        distance = Math.abs(time - at);
      }
    }
  }
  const last = active.length > 0 ? words.indexOf(active.at(-1)!) : anchor;
  return {
    active,
    context: anchor < 0 ? [] : words.slice(Math.max(0, anchor - contextWords), last + contextWords + 1),
  };
}

function searchable(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, "");
}

/** Find whole, consecutive transcript words; punctuation and case do not affect matching. */
export function phraseRanges(
  words: readonly TranscriptWord[],
  text: string,
): readonly { start: number; end: number }[] {
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
        `The phrase ${JSON.stringify(text)} has missing boundary times; inspect its passage and choose --start/--end`);
      matches.push({ start, end });
    }
  }
  return matches;
}
