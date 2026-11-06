import { canonicalize } from "@hypit/protocol";

import type { Text } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function verifyText(value: unknown): asserts value is Text {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "Text must be an object");
  assert(typeof (value as { readonly value?: unknown }).value === "string", "Text.value must be text");
}

export function sealText(value: string): Text {
  const result = canonicalize({ value }) as unknown as Text;
  verifyText(result);
  return result;
}
