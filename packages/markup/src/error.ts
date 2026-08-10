export class MarkupFrontendError extends Error {
  readonly code: string;
  readonly sourceName: string;
  readonly offset: number | undefined;

  constructor(code: string, message: string, sourceName: string, offset?: number) {
    super(`${code}: ${message}${offset === undefined ? "" : ` (${sourceName}:${offset})`}`);
    this.name = "MarkupFrontendError";
    this.code = code;
    this.sourceName = sourceName;
    this.offset = offset;
  }
}
