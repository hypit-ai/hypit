/**
 * Where a word gap belongs between two adjacent display surfaces.
 *
 * A Display Word is one lexical unit, and in Han, Hiragana and Katakana that unit is a single
 * character. A gap applied to every boundary therefore sets Chinese and Japanese as though every
 * character were a word, so each boundary decides its own gap from the two characters that meet
 * across it.
 *
 * The classes follow pangu.js: a CJK character beside a half-width letter, digit, bracket or
 * operator takes one space. The gap pangu inserts is an ordinary space, so a boundary either
 * carries the Style's `word-gap` or carries nothing.
 */

/** The three scripts the Script tokenizer treats as one character per lexical unit. */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * Full-width punctuation, including the bracket, quotation and dash pairs.
 *
 * These glyphs are drawn inside a full-width em box with their own side bearing, so a gap beside
 * one paints a second space over the one the font already carries. The ranges cover CJK
 * punctuation, the full-width ASCII forms, the curly quotes and the ellipsis, and stop short of
 * the full-width digits and letters at `０-９`, `Ａ-Ｚ` and `ａ-ｚ`, which
 * are ordinary word characters.
 */
const FULL_WIDTH_PUNCTUATION =
  /[、-〃〈-】〔-〟！-／：-＠［-｀｛-･‘’“”—…]/u;

/**
 * Half-width brackets and quotation marks take their space on the outside of the pair, which falls
 * out of reading the boundary characters: `displayWordSurfaces` attaches an opener to the surface
 * that follows it and a closer to the surface before it, so `中文(注)中文` meets `(` on the right
 * of one boundary and `)` on the left of the next, and both take a gap.
 *
 * A boundary with no CJK character on either side keeps the gap it has today. Latin spacing is not
 * what this decides.
 */
export function wordGapBetween(previous: string, next: string): boolean {
  const left = [...previous].at(-1);
  const right = [...next].at(0);
  if (left === undefined || right === undefined) return false;
  if (FULL_WIDTH_PUNCTUATION.test(left) || FULL_WIDTH_PUNCTUATION.test(right)) return false;
  return !(CJK.test(left) && CJK.test(right));
}

/** Every boundary in order. The first surface opens the run, so its entry is always `false`. */
export function wordGaps(surfaces: readonly string[]): readonly boolean[] {
  return surfaces.map((surface, index) => {
    const previous = surfaces[index - 1];
    return previous === undefined ? false : wordGapBetween(previous, surface);
  });
}

/**
 * A run whose boundaries all agree carries one `column-gap` on its container. A mixed run cannot,
 * because `column-gap` is uniform, and takes a margin per element instead.
 */
export function uniformGap(gaps: readonly boolean[]): boolean | undefined {
  const boundaries = gaps.slice(1);
  if (boundaries.length === 0) return false;
  if (boundaries.every((gap) => gap)) return true;
  return boundaries.some((gap) => gap) ? undefined : false;
}

/** Join surfaces back into prose, spacing only the boundaries that carry a gap. */
export function joinSurfaces(surfaces: readonly string[], separator: string): string {
  const gaps = wordGaps(surfaces);
  return surfaces.map((surface, index) => (gaps[index] ? `${separator}${surface}` : surface)).join("");
}
