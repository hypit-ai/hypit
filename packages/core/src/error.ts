import { SvmlError } from "@narratage/protocol";

export function invariant(
  condition: unknown,
  code: string,
  message: string,
  subject?: string,
): asserts condition {
  if (!condition) {
    throw new SvmlError(code, message, subject);
  }
}
