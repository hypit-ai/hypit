export class SpeechAlignmentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SpeechAlignmentError";
    this.code = code;
  }
}
