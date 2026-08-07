export class CaptionProjectionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CaptionProjectionError";
    this.code = code;
  }
}
