import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createHash as shimCreateHash } from "./playground/src/shims/node-crypto.ts";

/**
 * The playground runs the compiler's own `digestOf` in a browser, where
 * `node:crypto` does not exist. Content addressing is only meaningful if the
 * substitute agrees with the real thing on every byte, so pin them together.
 */
const cases = [
  "",
  "a",
  "abc",
  "svml.composition@1",
  // 55, 56 and 64 bytes straddle the SHA-256 padding boundary, where a wrong
  // implementation still passes short inputs.
  "x".repeat(55),
  "x".repeat(56),
  "x".repeat(64),
  "x".repeat(1000),
  "字幕轨道与画布",
  JSON.stringify({ contract: "svml.program-space@1", durationSec: 4 }),
];

test("the browser sha256 shim agrees with node:crypto", () => {
  for (const value of cases) {
    assert.equal(
      shimCreateHash("sha256").update(value).digest("hex"),
      createHash("sha256").update(value, "utf8").digest("hex"),
      `sha256 diverged for a ${value.length}-character input`,
    );
  }
});

test("the shim refuses algorithms and encodings it does not implement", () => {
  assert.throws(() => shimCreateHash("sha512"), /sha256/u);
  assert.throws(() => shimCreateHash("sha256").update("a").digest("base64"), /hex/u);
});
