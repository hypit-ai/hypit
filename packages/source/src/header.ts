export type SourceHeader = {
  readonly format: "svml.source-header@1";
  /** Logical Frontend request. A trusted Host resolves it to one exact implementation. */
  readonly using: string;
  readonly start: number;
  readonly end: number;
};

export class SourceHeaderError extends Error {
  readonly code: string;
  readonly sourceName: string;
  readonly offset: number;

  constructor(code: string, message: string, sourceName: string, offset: number) {
    super(`${sourceName}:${offset}: ${message}`);
    this.name = "SourceHeaderError";
    this.code = code;
    this.sourceName = sourceName;
    this.offset = offset;
  }
}

const MAX_HEADER_BYTES = 4_096;
const FRONTEND = /^[^\s<>&'"]+$/u;

function fail(sourceName: string, code: string, message: string, offset: number): never {
  throw new SourceHeaderError(code, message, sourceName, offset);
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
    fail(sourceName, "SOURCE_HEADER_MISSING", 'Source must begin with <?svml using="..."?>', start);
  }
  const bounded = text.slice(start, start + MAX_HEADER_BYTES + 1);
  const relativeClose = bounded.indexOf("?>", "<?svml".length);
  if (relativeClose < 0) {
    fail(sourceName, "SOURCE_HEADER_UNCLOSED", `Source Header must close within ${MAX_HEADER_BYTES} bytes`, start);
  }
  const close = start + relativeClose;
  const raw = text.slice(start, close + 2);
  if (new TextEncoder().encode(raw).byteLength > MAX_HEADER_BYTES) {
    fail(sourceName, "SOURCE_HEADER_UNCLOSED", `Source Header must close within ${MAX_HEADER_BYTES} bytes`, start);
  }
  const match = /^<\?svml[ \t]+using=(['"])([^'"\r\n]+)\1[ \t]*\?>$/u.exec(raw);
  if (match === null) {
    fail(
      sourceName,
      "SOURCE_HEADER_INVALID",
      'Source Header must use exactly <?svml using="logical-frontend-request"?>',
      start,
    );
  }
  const using = match[2]!;
  if (!FRONTEND.test(using)) {
    fail(sourceName, "SOURCE_HEADER_FRONTEND", "Source Header Frontend request must not be empty or padded", start);
  }
  const end = close + 2;
  const after = text.slice(end);
  const nextContent = /\S/u.exec(after);
  if (nextContent !== null && after.startsWith("<?svml", nextContent.index)) {
    fail(sourceName, "SOURCE_HEADER_DUPLICATE", "Source declares more than one Source Header", end + nextContent.index);
  }
  return { format: "svml.source-header@1", using, start, end };
}

/** Preserve every original offset while making the Header ordinary whitespace to body Frontends. */
export function maskSourceHeader(text: string, header: SourceHeader): string {
  const prefix = text.slice(0, header.end).replace(/[^\r\n]/gu, " ");
  return `${prefix}${text.slice(header.end)}`;
}
