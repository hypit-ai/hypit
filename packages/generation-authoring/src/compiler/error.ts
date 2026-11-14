export class CompilerError extends Error {
  readonly code: string;
  readonly subject: string | undefined;

  constructor(code: string, message: string, subject?: string) {
    super(message);
    this.name = "CompilerError";
    this.code = code;
    this.subject = subject;
  }
}
