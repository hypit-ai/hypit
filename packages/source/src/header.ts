export type SourceHeader = {
  /** Logical Frontend request. A trusted Host resolves it to one exact implementation. */
  readonly using: string;
  readonly start: number;
  readonly end: number;
};

export class SourceHeaderError extends Error {
  readonly code: string;
  readonly sourceName: string;
  readonly offset: number;
  readonly line: number;
  readonly column: number;

  constructor(code: string, message: string, sourceName: string, source: string, offset: number) {
    const before = source.slice(0, offset);
    const line = before.split("\n").length;
    const column = [...(before.split("\n").at(-1) ?? "")].length + 1;
    super(`${sourceName}:${line}:${column}: ${message}`);
    this.name = "SourceHeaderError";
    this.code = code;
    this.sourceName = sourceName;
    this.offset = offset;
    this.line = line;
    this.column = column;
  }
}

const FRONTEND = /^[^\s<>&'"]+$/u;

function fail(sourceName: string, source: string, code: string, message: string, offset: number): never {
  throw new SourceHeaderError(code, message, sourceName, source, offset);
}

/**
 * Parse the single irreducible SVML bootstrap directive.
 *
 * The grammar deliberately has no comments, aliases, interpolation or defaults:
 *
 *     [UTF-8 BOM] <?svml using="logical-frontend-request"?>
 */
export function parseSourceHeader(sourceName: string, text: string): SourceHeader {
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  if (!text.startsWith("<?svml", start)) {
    fail(sourceName, text, "SOURCE_HEADER_MISSING", 'Source must begin with <?svml using="..."?>', start);
  }
  const relativeClose = text.indexOf("?>", start + "<?svml".length);
  if (relativeClose < 0) {
    fail(sourceName, text, "SOURCE_HEADER_UNCLOSED", "Source Header is not closed", start);
  }
  const close = relativeClose;
  const raw = text.slice(start, close + 2);
  const match = /^<\?svml[ \t]+using=(['"])([^'"\r\n]+)\1[ \t]*\?>$/u.exec(raw);
  if (match === null) {
    fail(
      sourceName,
      text,
      "SOURCE_HEADER_INVALID",
      'Source Header must use exactly <?svml using="logical-frontend-request"?>',
      start,
    );
  }
  const using = match[2]!;
  if (!FRONTEND.test(using)) {
    fail(sourceName, text, "SOURCE_HEADER_FRONTEND", "Source Header Frontend request must not be empty or padded", start);
  }
  const end = close + 2;
  const after = text.slice(end);
  const nextContent = /\S/u.exec(after);
  if (nextContent !== null && after.startsWith("<?svml", nextContent.index)) {
    fail(sourceName, text, "SOURCE_HEADER_DUPLICATE", "Source declares more than one Source Header", end + nextContent.index);
  }
  return { using, start, end };
}

/** Preserve every original offset while making the Header ordinary whitespace to body Frontends. */
export function maskSourceHeader(text: string, header: SourceHeader): string {
  const prefix = text.slice(0, header.end).replace(/[^\r\n]/gu, " ");
  return `${prefix}${text.slice(header.end)}`;
}
