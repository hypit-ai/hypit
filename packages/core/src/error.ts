export class CoreError extends Error {
  readonly code: string;
  readonly subject: string | undefined;

  constructor(code: string, message: string, subject?: string) {
    super(message);
    this.name = "CoreError";
    this.code = code;
    this.subject = subject;
  }
}

export function invariant(
  condition: unknown,
  code: string,
  message: string,
  subject?: string,
): asserts condition {
  if (!condition) {
    throw new CoreError(code, message, subject);
  }
}
