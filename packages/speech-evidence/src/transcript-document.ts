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
const RECORD_ID = /^[a-z][a-z0-9_-]{0,63}$/u;
const seconds = (sample: number | undefined): number | undefined =>
  sample === undefined ? undefined : sample / SAMPLE_RATE;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function escapeMarkupBoundaries(json: string): string {
  return json.replace(/[<>&\u2028\u2029]/gu, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** Encode the exact provider-neutral evidence body used by the Transcript Raw Surface. */
export function encodeSpeechTranscriptEvidence(evidence: SpeechTranscriptEvidence): string {
  assertSpeechTranscriptEvidence(evidence);
  return escapeMarkupBoundaries(JSON.stringify(evidence, null, 2));
}

/** Decode the exact JSON body of a Transcript Raw Surface. */
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

/** Materialize exact evidence as an ordinary author Source. */
export function speechTranscriptSource(id: string, evidence: SpeechTranscriptEvidence): string {
  assert(RECORD_ID.test(id), "Speech transcript id must be a canonical lower-case identifier");
  return `<?svml using="@hypit/markup@1"?>\n<svml>\n  <import as="speech" from="@hypit/speech-evidence@1"/>\n  <speech:Transcript id="${id}">\n${encodeSpeechTranscriptEvidence(evidence)}\n  </speech:Transcript>\n</svml>\n`;
}

/** Read the canonical author Source emitted by speechTranscriptSource. */
export function decodeSpeechTranscriptSource(
  source: string,
  subject = "speech transcript source",
): SpeechTranscriptEvidence {
  assert(source.includes('<?svml using="@hypit/markup@1"?>'), `${subject}: expected an SVML Markup header`);
  assert(source.includes('<import as="speech" from="@hypit/speech-evidence@1"/>'),
    `${subject}: expected the speech-evidence import`);
  const opening = /<speech:Transcript id="[a-z][a-z0-9_-]{0,63}">/u.exec(source);
  assert(opening !== null && opening.index !== undefined, `${subject}: expected one speech:Transcript Surface`);
  const contentStart = opening.index + opening[0].length;
  const close = "</speech:Transcript>";
  const closeStart = source.indexOf(close, contentStart);
  assert(closeStart >= 0, `${subject}: speech:Transcript is not closed`);
  assert(source.indexOf("<speech:Transcript", contentStart) < 0,
    `${subject}: expected exactly one speech:Transcript Surface`);
  return decodeSpeechTranscriptEvidence(source.slice(contentStart, closeStart).trim(), subject);
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
