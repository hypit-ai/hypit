import type { TimedTranscriptWord } from "./index.js";
import { matchWords, normalizeWord } from "./word-matching.js";

export type TranscriptWindow = { readonly start: number; readonly end: number };
export type AlignedTranscriptWord = TimedTranscriptWord & TranscriptWindow;
export type TranscriptTimingSource = "matched" | "distributed" | "estimated";

type LocatedWord = TranscriptWindow & { readonly source: TranscriptTimingSource };

function lerp(start: number, end: number, fraction: number): number {
  return fraction === 1 ? end : Math.min(end, start + (end - start) * fraction);
}

function distribute(weights: readonly number[], window: TranscriptWindow): readonly TranscriptWindow[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let used = 0;
  let start = window.start;
  const timings = weights.map(weight => {
    used += weight;
    const end = lerp(window.start, window.end, used / total);
    const range = { start, end };
    start = end;
    return range;
  });
  // When numbers cannot represent every interior cut, share the positive window.
  return timings.some(range => range.start >= range.end) ? weights.map(() => window) : timings;
}

function evidenceWindow(words: readonly TimedTranscriptWord[]): TranscriptWindow | undefined {
  let start = Infinity;
  let end = -Infinity;
  for (const word of words) {
    if (word.start === undefined || word.end === undefined || word.end <= word.start) continue;
    start = Math.min(start, word.start);
    end = Math.max(end, word.end);
  }
  return start < end ? { start, end } : undefined;
}

function estimate(weights: readonly number[], window: TranscriptWindow, before?: LocatedWord, after?: LocatedWord) {
  const left = before?.end ?? window.start;
  const right = after?.start ?? window.end;
  if (left < right) return distribute(weights, { start: left, end: right });

  // Adjacent anchors may touch or overlap, including at the edge of the input window.
  const first = before ?? { start: window.start, end: window.start };
  const last = after ?? { start: window.end, end: window.end };
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let used = 0;
  const ranges = weights.map(weight => {
    const fraction = (used + weight / 2) / total;
    used += weight;
    return { start: lerp(first.start, last.start, fraction), end: lerp(first.end, last.end, fraction) };
  });
  return ranges.some(range => range.end <= range.start) ? weights.map(() => first.start < first.end ? first : last) : ranges;
}

export function alignTranscriptWords(
  authored: readonly string[],
  evidence: readonly TimedTranscriptWord[],
  window: TranscriptWindow,
): { readonly words: readonly AlignedTranscriptWord[]; readonly timingSources: readonly TranscriptTimingSource[] } {
  if (!Number.isFinite(window.start) || !Number.isFinite(window.end) || window.start < 0 || window.start >= window.end) {
    throw new Error("Transcript alignment requires a finite audio window with 0 <= start < end.");
  }
  for (const [index, word] of authored.entries()) {
    if (typeof word !== "string" || word.trim() === "") throw new Error(`Authored word ${index + 1} must be nonempty text.`);
  }
  for (const [index, word] of evidence.entries()) {
    if (word.start !== undefined && word.end !== undefined && (word.start < window.start || word.end > window.end)) {
      throw new Error(`Transcript word ${index + 1} lies outside the alignment window.`);
    }
  }
  const normalized = authored.map(normalizeWord);
  const weights = normalized.map(word => Math.max(1, [...word].length));
  const matches = evidenceWindow(evidence) === undefined ? [] : matchWords(normalized, evidence.map(word => normalizeWord(word.word)));
  const located = Array<LocatedWord | undefined>(authored.length).fill(undefined);
  let floor = { start: window.start, end: window.start };
  for (const match of matches) {
    const measured = evidenceWindow(evidence.slice(match.evidenceStart, match.evidenceEnd));
    if (measured === undefined) continue;
    const single = match.authoredEnd - match.authoredStart === 1 && match.evidenceEnd - match.evidenceStart === 1;
    const ranges = distribute(weights.slice(match.authoredStart, match.authoredEnd), measured);
    for (const [index, range] of ranges.entries()) {
      const start = Math.max(floor.start, range.start);
      const end = Math.max(floor.end, range.end);
      const source = start !== range.start || end !== range.end ? "estimated" : single ? "matched" : "distributed";
      located[match.authoredStart + index] = { start, end, source };
      floor = { start, end };
    }
  }

  for (let index = 0; index < located.length;) {
    if (located[index] !== undefined) { index += 1; continue; }
    const start = index;
    while (index < located.length && located[index] === undefined) index += 1;
    const ranges = estimate(weights.slice(start, index), window, located[start - 1], located[index]);
    for (const [offset, range] of ranges.entries()) {
      located[start + offset] = { start: range.start, end: range.end, source: "estimated" };
    }
  }
  return {
    words: authored.map((word, index) => ({ word, start: located[index]!.start, end: located[index]!.end })),
    timingSources: located.map(word => word!.source),
  };
}
