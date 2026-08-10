export class CaptionTimingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CaptionTimingError";
    this.code = code;
  }
}
