import { SvmlError } from "@hypit/protocol";

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
