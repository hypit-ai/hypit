export class MarkupFrontendError extends Error {
  readonly code: string;
  readonly sourceName: string;
  readonly offset: number | undefined;
  readonly line: number | undefined;
  readonly column: number | undefined;

  constructor(code: string, message: string, sourceName: string, offset?: number, source?: string) {
    const before = offset === undefined || source === undefined ? undefined : source.slice(0, offset);
    const line = before === undefined ? undefined : before.split("\n").length;
    const column = before === undefined ? undefined : [...(before.split("\n").at(-1) ?? "")].length + 1;
    super(`${code}: ${message}${line === undefined ? "" : ` (${sourceName}:${line}:${column})`}`);
    this.name = "MarkupFrontendError";
    this.code = code;
    this.sourceName = sourceName;
    this.offset = offset;
    this.line = line;
    this.column = column;
  }
}
