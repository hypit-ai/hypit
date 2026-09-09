export type LexicalUnit = {
  readonly text: string;
  readonly index: number;
};

const CHARACTER_UNIT = String.raw`[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]`;
// A Latin name beside Han prose ends at the script boundary, even without an authored space.
const WORD_CHARACTER = String.raw`(?:(?!${CHARACTER_UNIT})[\p{L}\p{M}\p{N}])`;
const LEXICAL_UNIT = new RegExp([
  String.raw`(?:\p{N}{1,3}(?:[,，]\p{N}{3})+|\p{N}+)(?:[.．]\p{N}+)?(?:-\p{N}+(?:[.．]\p{N}+)?)*(?!\p{N}|-[\p{L}\p{M}])`,
  String.raw`${CHARACTER_UNIT}\p{M}*`,
  String.raw`${WORD_CHARACTER}+(?:['’.-]${WORD_CHARACTER}+)*`,
].join("|"), "gu");

const OPENING_PUNCTUATION = new Set([
  "(", "[", "{", "（", "【", "《", "「", "『", "〔", "〈", "“", "‘",
  "$", "¥", "￥", "€", "£",
]);

const QUOTE_PUNCTUATION = new Set(["\"", "'", "`", "’", "ʼ"]);
const UNICODE_OPENING_PUNCTUATION = /[\p{Ps}\p{Pi}]/u;

/**
 * ASCII quotation marks have no Unicode opening/closing category. In a gap between
 * lexical units, whitespace before the mark is the useful authoring signal:
 * `said "hello` opens a quote, while `hello" world` closes one. A quote before the
 * first unit is opening by definition; contractions stay inside one lexical unit.
 */
function isOpeningPunctuation(
  character: string,
  gap: string,
  position: number,
  hasPreviousSurface: boolean,
): boolean {
  if (OPENING_PUNCTUATION.has(character) || UNICODE_OPENING_PUNCTUATION.test(character)) return true;
  if (!QUOTE_PUNCTUATION.has(character)) return false;
  if (!hasPreviousSurface) return true;
  const before = [...gap.slice(0, position)].at(-1);
  return before !== undefined && /\s/u.test(before);
}

export function lexicalUnits(value: string): readonly LexicalUnit[] {
  return [...value.matchAll(LEXICAL_UNIT)].map((match) => ({
    text: match[0],
    index: match.index,
  }));
}

export function lexicalCount(value: string): number {
  return lexicalUnits(value).length;
}

/** Canonical prose spacing; punctuation remains display/speech information, never a timing token. */
export function cleanProjection(value: string): string {
  return value
    .replace(/\s+/gu, " ")
    .replace(/\s+([,.;:!?%…，。！？；：、％‰）】》」』〕〉}\]])/gu, "$1")
    .replace(/([([{（【《「『〔〈“‘])\s+/gu, "$1")
    // Do not erase a cross-script space: `here 你好` must remain two semantic regions.
    // Only collapse explicit spaces inside one CJK run; the lexical tokenizer already keeps
    // adjacent Latin and CJK runs separate when no space was authored.
    .replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, "$1")
    .trim();
}

/** Structural markers split atoms but must not invent prose whitespace when those atoms rejoin. */
export function joinProjection(parts: readonly string[]): string {
  return cleanProjection(parts.join(""));
}

/**
 * Display units follow the same lexical boundaries as semantic speech tokens. Punctuation is kept
 * for rendering: opening punctuation belongs to the next unit; all other inter-token punctuation
 * belongs to the previous unit. Whitespace is layout, not a display word of its own.
 */
export function displayWordSurfaces(value: string): readonly string[] {
  const prose = cleanProjection(value);
  const units = lexicalUnits(prose);
  if (units.length === 0) return [];

  const surfaces: string[] = [];
  let cursor = 0;
  let prefix = "";
  for (const unit of units) {
    const gap = prose.slice(cursor, unit.index);
    const punctuation = [...gap]
      .map((character, position) => ({ character, position }))
      .filter(({ character }) => !/\s/u.test(character));
    if (surfaces.length === 0) {
      prefix += punctuation.map(({ character }) => character).join("");
    } else {
      const suffix = punctuation
        .filter(({ character, position }) => !isOpeningPunctuation(character, gap, position, true))
        .map(({ character }) => character)
        .join("");
      const opening = punctuation
        .filter(({ character, position }) => isOpeningPunctuation(character, gap, position, true))
        .map(({ character }) => character)
        .join("");
      if (suffix) surfaces[surfaces.length - 1] += suffix;
      prefix += opening;
    }
    surfaces.push(`${prefix}${unit.text}`);
    prefix = "";
    cursor = unit.index + unit.text.length;
  }
  const trailing = prose.slice(cursor).replace(/\s+/gu, "");
  if (trailing) surfaces[surfaces.length - 1] += trailing;
  return surfaces;
}

/** Closing punctuation before a lexical unit belongs to the previous display unit when one exists. */
export function splitLeadingClosingPunctuation(value: string): {
  readonly previous: string;
  readonly current: string;
} {
  const prose = cleanProjection(value);
  const first = lexicalUnits(prose)[0];
  if (first === undefined) return { previous: prose.replace(/\s+/gu, ""), current: "" };
  const leading = prose.slice(0, first.index);
  const punctuation = [...leading]
    .map((character, position) => ({ character, position }))
    .filter(({ character }) => !/\s/u.test(character));
  const previous = punctuation
    .filter(({ character, position }) => !isOpeningPunctuation(character, leading, position, false))
    .map(({ character }) => character)
    .join("");
  const opening = punctuation
    .filter(({ character, position }) => isOpeningPunctuation(character, leading, position, false))
    .map(({ character }) => character)
    .join("");
  return { previous, current: `${opening}${prose.slice(first.index)}` };
}
