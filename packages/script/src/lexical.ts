export type LexicalUnit = {
  readonly text: string;
  readonly index: number;
};

const CHARACTER_UNIT = String.raw`[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]`;
// A Latin name beside Han prose ends at the script boundary, even without an authored space.
const WORD_CHARACTER = String.raw`(?:(?!${CHARACTER_UNIT})[\p{L}\p{M}\p{N}])`;
const WORD_JOIN = String.raw`(?:['’.-]${WORD_CHARACTER}+)*`;
const LEXICAL_UNIT = new RegExp([
  // A comma-grouped number is one unit even when a hyphenated word follows, so
  // "1,000-word" stays whole instead of falling back to the bare number "1".
  String.raw`\p{N}{1,3}(?:[,，]\p{N}{3})+(?:[.．]\p{N}+)?(?:-\p{N}+(?:[.．]\p{N}+)?)*(?:-${WORD_CHARACTER}+${WORD_JOIN})*(?!\p{N})`,
  String.raw`\p{N}+(?:[.．]\p{N}+)?(?:-\p{N}+(?:[.．]\p{N}+)?)*(?!\p{N}|-[\p{L}\p{M}])`,
  String.raw`${CHARACTER_UNIT}\p{M}*`,
  String.raw`(?:(?!${CHARACTER_UNIT})[\p{L}\p{N}])${WORD_CHARACTER}*${WORD_JOIN}`,
].join("|"), "gu");

// Unicode owns bracket/quote categories. ASCII symmetric quotes need local context;
// they have no opening/closing category. This is prose analysis, not marker syntax.
function openingAt(gap: string, hasPrevious: boolean, beforeWord = true): number {
  for (const match of gap.matchAll(/./gu)) {
    const character = match[0];
    if (/[\p{Ps}\p{Pi}\p{Sc}]/u.test(character)
      || ((/["'`]/u.test(character) || (beforeWord && /\p{Pf}/u.test(character))) && (!hasPrevious || /\s$/u.test(gap.slice(0, match.index))))) return match.index;
  }
  return gap.length;
}

export function lexicalUnits(value: string): readonly LexicalUnit[] {
  return [...value.matchAll(LEXICAL_UNIT)].map(match => ({ text: match[0], index: match.index }));
}

export function lexicalCount(value: string): number {
  return lexicalUnits(value).length;
}

/** Normalize source formatting without inventing language-specific separators. */
export function cleanProjection(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function joinProjection(parts: readonly string[]): string {
  return cleanProjection(parts.join(""));
}

export type DisplaySurface = { readonly text: string; readonly separatorBefore: "" | " " };
type ProseWord = { start: number; end: number; separatorBefore: "" | " " };

/** Analyze complete prose once. Speech cores and their written surfaces are distinct:
 * punctuation has spelling and source extent, but does not acquire speech timing.
 * A display-only literal (for example an emoji in Dual Text) needs no speech core.
 */
export function analyzeProse(value: string, followsDisplay = false): {
  readonly units: readonly LexicalUnit[];
  readonly surfaces: readonly DisplaySurface[];
  readonly editRanges: readonly { start: number; end: number }[];
} {
  const units = lexicalUnits(value);
  const words: ProseWord[] = [];
  let cursor = 0;
  for (const unit of units) {
    const gap = value.slice(cursor, unit.index);
    const opening = openingAt(gap, words.length > 0 || followsDisplay);
    const closing = gap.slice(0, opening);
    const previous = words.at(-1);
    if (previous) previous.end = cursor + closing.trimEnd().length;
    const start = previous || followsDisplay ? cursor + opening : value.slice(0, unit.index).search(/\S/u);
    words.push({ start: start < 0 ? unit.index : start, end: unit.index + unit.text.length,
      separatorBefore: previous && /\s$/u.test(closing) ? " " : "" });
    cursor = unit.index + unit.text.length;
  }
  const last = words.at(-1);
  if (last) last.end = value.trimEnd().length;
  const surfaces = words.map(word => ({ text: value.slice(word.start, word.end).replace(/\s+/gu, " "), separatorBefore: word.separatorBefore }));
  const editRanges = words.map((word, index) => {
    const unit = units[index]!;
    let end = unit.index + unit.text.length;
    // Whitespace is a legal insertion boundary. Only adjacent trailing punctuation
    // belongs to the indivisible edit surface ("word," versus "word ,").
    const trailing = value.slice(end, word.end);
    const whitespace = trailing.search(/\s/u);
    end += whitespace < 0 ? trailing.length : whitespace;
    return { start: word.start, end };
  });
  if (surfaces.length === 0 && value.trim()) surfaces.push({ text: cleanProjection(value), separatorBefore: "" });
  return { units, surfaces, editRanges };
}

export function displaySurfaces(value: string): readonly DisplaySurface[] {
  return analyzeProse(value).surfaces;
}

/** Correspondence boundaries retain punctuation on either side of an explicit Dual. */
export function splitDisplayPrefix(value: string, hasPrevious: boolean): { previous: string; current: string } {
  const first = lexicalUnits(value)[0];
  const end = first?.index ?? value.length;
  const split = openingAt(value.slice(0, end), hasPrevious, first !== undefined);
  return { previous: value.slice(0, split), current: value.slice(split) };
}
