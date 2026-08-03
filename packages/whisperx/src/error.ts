export class WhisperXAlignmentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WhisperXAlignmentError";
    this.code = code;
  }
}
