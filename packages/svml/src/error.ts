export class SvmlFrontendError extends Error {
  readonly code: string;
  readonly sourceName: string;
  readonly offset: number;

  constructor(code: string, message: string, sourceName: string, offset: number) {
    super(`${message} (${sourceName}:${offset})`);
    this.name = "SvmlFrontendError";
    this.code = code;
    this.sourceName = sourceName;
    this.offset = offset;
  }
}
