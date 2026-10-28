/**
 * A tokenizer for SVML source syntax.
 *
 * Recognize the common Markup shell and Script prose for highlighting, without
 * validating package-owned Surfaces. The Script
 * markers are the point: `@{claim} … @{/claim}` is what a Media Item binds to, so it
 * has to read as a distinct thing from an ordinary attribute.
 *
 * Tokens are non-overlapping and in source order. Gaps between them are plain
 * text; the renderer emits those verbatim, so the concatenation of everything is
 * always byte-identical to the source.
 */

export type TokenKind =
  | "header"
  | "comment"
  | "punct"
  | "tag"
  | "attr"
  | "string"
  | "reference"
  | "marker"
  | "role";

export type Token = {
  readonly start: number;
  readonly end: number;
  readonly kind: TokenKind;
  /** For `marker` tokens, the Selection or Moment the marker names. */
  readonly id?: string;
};

const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/u;
const ATTRIBUTE = /^[A-Za-z_][A-Za-z0-9_.:-]*/u;
/** All control sigils belong inside a delimited Script marker. */
const MARKER = /^@\{(?:(~)?([a-z][a-z0-9_-]{0,63})(!)?|\/([a-z][a-z0-9_-]{0,63})(~)?)\}/u;

function unescapedIndex(source: string, character: string, from: number, to = source.length): number {
  for (let index = from; index < to; index++) {
    if (source[index] === "\\") { index++; continue; }
    if (source[index] === character) return index;
  }
  return -1;
}

function scriptDecoration(source: string, cursor: number, push: Push, markers = true, attributes = true): number {
  if (source[cursor] === "\\") return cursor + 2;
  const marker = markers ? MARKER.exec(source.slice(cursor)) : null;
  if (marker) {
    push(cursor, cursor + marker[0].length, "marker", marker[2] ?? marker[4]);
    return cursor + marker[0].length;
  }
  if (attributes && source[cursor] === "{") {
    const end = unescapedIndex(source, "}", cursor + 1);
    if (end >= 0) { push(cursor, end + 1, "attr"); return end + 1; }
  }
  return cursor + 1;
}

function localName(tag: string): string {
  const colon = tag.indexOf(":");
  return colon < 0 ? tag : tag.slice(colon + 1);
}

function isSpace(value: string | undefined): boolean {
  return value === " " || value === "\t" || value === "\n" || value === "\r";
}

export function tokenizeSvml(source: string): readonly Token[] {
  const tokens: Token[] = [];
  const push = (start: number, end: number, kind: TokenKind, id?: string): void => {
    if (end > start) tokens.push({ start, end, kind, ...(id === undefined ? {} : { id }) });
  };

  let cursor = 0;
  while (cursor < source.length) {
    if (source.startsWith("<?", cursor)) {
      const end = source.indexOf("?>", cursor + 2);
      const stop = end < 0 ? source.length : end + 2;
      push(cursor, stop, "header");
      cursor = stop;
      continue;
    }

    if (source.startsWith("<!--", cursor)) {
      const end = source.indexOf("-->", cursor + 4);
      const stop = end < 0 ? source.length : end + 3;
      push(cursor, stop, "comment");
      cursor = stop;
      continue;
    }

    if (source[cursor] === "<") {
      const closing = source[cursor + 1] === "/";
      const nameStart = cursor + (closing ? 2 : 1);
      const name = NAME.exec(source.slice(nameStart));
      if (name === null) {
        // A bare `<` in prose. Leave it as plain text so offsets never drift.
        cursor += 1;
        continue;
      }
      push(cursor, nameStart, "punct");
      push(nameStart, nameStart + name[0].length, "tag");
      cursor = nameStart + name[0].length;
      cursor = tokenizeAttributes(source, cursor, push);

      // Script's opaque declaration has its own prose grammar.
      if (!closing && localName(name[0]) === "script" && source[cursor - 2] !== "/") {
        cursor = tokenizeScriptBody(source, cursor, name[0], push);
      }
      continue;
    }

    cursor += 1;
  }
  return tokens;
}

type Push = (start: number, end: number, kind: TokenKind, id?: string) => void;

/** Consume attributes through the tag's `>` or `/>`, whichever closes it. */
function tokenizeAttributes(source: string, from: number, push: Push): number {
  let cursor = from;
  while (cursor < source.length) {
    while (isSpace(source[cursor])) cursor += 1;
    if (source.startsWith("/>", cursor)) {
      push(cursor, cursor + 2, "punct");
      return cursor + 2;
    }
    if (source[cursor] === ">") {
      push(cursor, cursor + 1, "punct");
      return cursor + 1;
    }
    const name = ATTRIBUTE.exec(source.slice(cursor));
    if (name === null) return cursor + 1;
    push(cursor, cursor + name[0].length, "attr");
    cursor += name[0].length;

    while (isSpace(source[cursor])) cursor += 1;
    if (source[cursor] !== "=") continue;
    push(cursor, cursor + 1, "punct");
    cursor += 1;
    while (isSpace(source[cursor])) cursor += 1;

    const quote = source[cursor];
    if (quote === "\"" || quote === "'") {
      const close = source.indexOf(quote, cursor + 1);
      const stop = close < 0 ? source.length : close + 1;
      push(cursor, stop, "string");
      cursor = stop;
      continue;
    }
    if (quote === "{") {
      const close = source.indexOf("}", cursor + 1);
      const stop = close < 0 ? source.length : close + 1;
      push(cursor, stop, "reference");
      cursor = stop;
      continue;
    }
  }
  return cursor;
}

/** Script prose: Segment and Role Cue tags stay tags; `@{id}` markers stand out. */
function tokenizeScriptBody(source: string, from: number, tag: string, push: Push): number {
  const close = `</${tag}>`;
  let cursor = from;
  let inSegment = false;
  while (cursor < source.length) {
    if (source[cursor] === "\\") { cursor += 2; continue; }
    if (source.startsWith(close, cursor)) {
      push(cursor, cursor + 2, "punct");
      push(cursor + 2, cursor + 2 + tag.length, "tag");
      push(cursor + 2 + tag.length, cursor + close.length, "punct");
      return cursor + close.length;
    }
    if (source.startsWith("<!--", cursor)) {
      const end = source.indexOf("-->", cursor + 4);
      const stop = end < 0 ? source.length : end + 3;
      push(cursor, stop, "comment");
      cursor = stop;
      continue;
    }
    if (source[cursor] === "<") {
      const endDual = unescapedIndex(source, ">", cursor + 1);
      const pipe = endDual < 0 ? -1 : unescapedIndex(source, "|", cursor + 1, endDual);
      if (pipe >= 0) {
        const shared = !source.slice(pipe + 1, endDual).trim();
        push(cursor, cursor + 1, "punct");
        cursor++;
        while (cursor < pipe) cursor = scriptDecoration(source, cursor, push, shared, true);
        push(pipe, pipe + 1, "punct");
        cursor = pipe + 1;
        while (cursor < endDual) cursor = scriptDecoration(source, cursor, push, true, false);
        push(endDual, endDual + 1, "punct");
        cursor = endDual + 1;
        continue;
      }
      const closing = source[cursor + 1] === "/";
      const nameStart = cursor + (closing ? 2 : 1);
      const end = source.indexOf(">", nameStart);
      const stop = end < 0 ? source.length : end + 1;
      const selfClosing = end >= 0 && source[end - 1] === "/";
      const nameEnd = end < 0 ? stop : end - (selfClosing ? 1 : 0);
      push(cursor, nameStart, "punct");
      // Context distinguishes Segments from Role Cues, regardless of language or case.
      push(nameStart, nameEnd, inSegment && !closing ? "role" : "tag");
      push(nameEnd, stop, "punct");
      if (closing) inSegment = false;
      else if (!inSegment && !selfClosing) inSegment = true;
      cursor = stop;
      continue;
    }
    cursor = scriptDecoration(source, cursor, push);
  }
  return cursor;
}
