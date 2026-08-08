import assert from "node:assert/strict";
import test from "node:test";

import { validateStoredValue } from "../src/index.js";
import type { ValueSchema } from "@narratage/protocol";

function inline(value: unknown): { kind: "inline"; value: never } {
  return { kind: "inline", value: value as never };
}

test("a colour format admits both opaque and alpha hex, and nothing else", () => {
  const schema: ValueSchema = { kind: "string", format: "color" };
  assert.doesNotThrow(() => validateStoredValue(inline("#09090B"), schema));
  assert.doesNotThrow(() => validateStoredValue(inline("#09090bcc"), schema));
  assert.throws(() => validateStoredValue(inline("black"), schema), /#RRGGBB/u);
  assert.throws(() => validateStoredValue(inline("#09090"), schema), /#RRGGBB/u);
  // Three-digit shorthand is a CSS convenience the video contract does not take.
  assert.throws(() => validateStoredValue(inline("#abc"), schema), /#RRGGBB/u);
});

test("a digest format admits only a full sha256 identity", () => {
  const schema: ValueSchema = { kind: "string", format: "digest" };
  assert.doesNotThrow(() => validateStoredValue(inline(`sha256:${"a1".repeat(32)}`), schema));
  assert.throws(() => validateStoredValue(inline("sha256:abc"), schema), /sha256/u);
  assert.throws(() => validateStoredValue(inline("a1".repeat(32)), schema), /sha256/u);
});

test("a format describes a value without narrowing what its type already allows", () => {
  // unit-fraction, duration and multiline carry no shape of their own: bounds
  // are the schema's job, and stating them twice would let the two disagree.
  const fraction: ValueSchema = { kind: "number", format: "unit-fraction", minimum: 0, maximum: 1 };
  assert.doesNotThrow(() => validateStoredValue(inline(0.84), fraction));
  assert.throws(() => validateStoredValue(inline(1.5), fraction), /<= 1/u);

  const prose: ValueSchema = { kind: "string", format: "multiline" };
  assert.doesNotThrow(() => validateStoredValue(inline("two\nlines"), prose));
});

test("an unformatted string is still just a string", () => {
  assert.doesNotThrow(() => validateStoredValue(inline("#zzz"), { kind: "string" }));
});
