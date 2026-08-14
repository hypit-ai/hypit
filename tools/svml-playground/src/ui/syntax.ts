/**
 * A tokenizer for SVML's own surface syntax.
 *
 * SVML has a small, closed grammar — tags, quoted strings, whole-value
 * references, and Script prose with markers — so it is tokenized directly rather
 * than through a general highlighter that has no grammar for it. The Script
 * markers are the point: `@claim … @/claim` is what a Media Item binds to, so it
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
/**
 * The Script's own marker grammar: `@id` opens a Selection, `@/id` closes one,
 * `@id!` marks a Moment, and a leading `~` or trailing `~` chooses which side of
 * the neighbouring word the marker binds to.
 */
const MARKER = /^~?@\/?[a-z][a-z0-9_-]*[!~]?/u;

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

      // Script is the language's one Raw Surface: its body is prose with
      // markers, not markup, and must be scanned by different rules.
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

/** Script prose: Segment and Role Cue tags stay tags; `@id` markers stand out. */
function tokenizeScriptBody(source: string, from: number, tag: string, push: Push): number {
  const close = `</${tag}>`;
  let cursor = from;
  while (cursor < source.length) {
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
      const closing = source[cursor + 1] === "/";
      const nameStart = cursor + (closing ? 2 : 1);
      const name = NAME.exec(source.slice(nameStart));
      if (name === null) { cursor += 1; continue; }
      const end = source.indexOf(">", nameStart);
      const stop = end < 0 ? source.length : end + 1;
      push(cursor, nameStart, "punct");
      // An upper-case tag inside Script is a Role Cue, not a Segment.
      push(nameStart, nameStart + name[0].length, /^[A-Z]/u.test(name[0]) ? "role" : "tag");
      push(nameStart + name[0].length, stop, "punct");
      cursor = stop;
      continue;
    }
    // A leading `~` binds the marker to the word on its left, and is part of it.
    if (source[cursor] === "@" || (source[cursor] === "~" && source[cursor + 1] === "@")) {
      const marker = MARKER.exec(source.slice(cursor));
      if (marker !== null) {
        // Strip the affinity sigils, the `@` and the closing `/` so an opening
        // marker, its closing marker and a Moment all report the same name.
        const id = marker[0].replace(/^~?@\/?/u, "").replace(/[!~]$/u, "");
        push(cursor, cursor + marker[0].length, "marker", id);
        cursor += marker[0].length;
        continue;
      }
    }
    cursor += 1;
  }
  return cursor;
}
