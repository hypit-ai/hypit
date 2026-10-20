import assert from "node:assert/strict";
import test from "node:test";
import { acceptSecretBytes } from "../../src/secret-input.js";

test("terminal secret input preserves UTF-8 and removes one code point on backspace", () => {
  const raw: number[] = [];
  const pasted = Buffer.from("密钥🔑", "utf8");
  assert.equal(acceptSecretBytes(raw, pasted.subarray(0, 4)), "continue");
  assert.equal(acceptSecretBytes(raw, pasted.subarray(4)), "continue");
  assert.equal(Buffer.from(raw).toString("utf8"), "密钥🔑");
  assert.equal(acceptSecretBytes(raw, Buffer.from([127])), "continue");
  assert.equal(Buffer.from(raw).toString("utf8"), "密钥");
  assert.equal(acceptSecretBytes(raw, Buffer.from([13])), "done");
});

test("terminal secret input reports cancellation without decoding partial bytes", () => {
  const raw: number[] = [];
  assert.equal(acceptSecretBytes(raw, Buffer.from([0xe5, 3])), "cancelled");
});
