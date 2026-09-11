import type { CaptionAlignmentUnit } from "@hypit/narrative";

import { wordGaps } from "./spacing.js";

type ActivationFrames = ReadonlyMap<string, { readonly start: number; readonly end: number }>;

/**
 * Karaoke repaints one Alignment Unit at a time. A Unit is one lexical unit, and in Han, Hiragana
 * and Katakana that unit is a single character, so the highlight crawls character by character
 * across a word the reader takes in at once.
 *
 * Reading the Cue as prose recovers its words. `wordGaps` says which boundaries carry a space, so
 * the surfaces join back into exactly the prose the renderer draws, and the runtime's word
 * segmenter returns the words inside it. A word that covers several Units gives them one shared
 * activation window, so the whole word lights together.
 *
 * Only the window is shared. Layout, spacing, per-Unit motion and the CaptionDocument are the same
 * values they were, so speech tokens, authored markers and measured timing are untouched.
 *
 * Segmentation is advisory here: it decides which characters light together and nothing else. A
 * word the segmenter splits differently changes how the highlight steps, never the timing beneath
 * it. Scripts written without spaces that arrive as one Unit, such as Thai, Khmer and Lao, keep the
 * highlight they have, because a Unit is the smallest thing that carries a measured window and this
 * pass can join Units but cannot divide one.
 */
const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });

export function karaokeWordActivation(
  atoms: readonly CaptionAlignmentUnit[],
  wordText: ReadonlyMap<string, string>,
  activation: ActivationFrames,
): ActivationFrames {
  if (atoms.length < 2) return activation;

  const surfaces = atoms.map((atom) => atom.wordIds.map((wordId) => wordText.get(wordId) ?? "").join(""));
  const gaps = wordGaps(surfaces);

  let prose = "";
  const spans = surfaces.map((surface, index) => {
    if (gaps[index]) prose += " ";
    const start = prose.length;
    prose += surface;
    return { start, end: prose.length };
  });

  const merged = new Map(activation);
  for (const word of segmenter.segment(prose)) {
    if (!word.isWordLike) continue;
    const wordEnd = word.index + word.segment.length;
    const members = spans
      .map((span, index) => ({ span, index }))
      .filter(({ span }) => span.start < wordEnd && span.end > word.index)
      .map(({ index }) => index);
    if (members.length < 2) continue;

    let start = Number.POSITIVE_INFINITY;
    let end = Number.NEGATIVE_INFINITY;
    for (const member of members) {
      // The exclusive window already ends each Unit where the next one starts, so the run's own
      // bounds are the shared window. Read them from the incoming map: a Unit that two words touch
      // must not compound the widening.
      const timing = activation.get(atoms[member]!.id);
      if (timing === undefined) return activation;
      start = Math.min(start, timing.start);
      end = Math.max(end, timing.end);
    }
    for (const member of members) merged.set(atoms[member]!.id, { start, end });
  }
  return merged;
}
