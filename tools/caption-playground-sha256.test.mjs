import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createHash as shimCreateHash } from "./caption-playground/src/shims/node-crypto.ts";

const cases = ["", "abc", "x".repeat(55), "x".repeat(56), "x".repeat(64), "字幕轨道与画布"];
test("Caption Playground browser sha256 agrees with Node", () => {
  for (const value of cases) {
    assert.equal(shimCreateHash("sha256").update(value).digest("hex"), createHash("sha256").update(value).digest("hex"));
  }
});

test("Caption Playground browser sha256 rejects unsupported operations", () => {
  assert.throws(() => shimCreateHash("sha512"), /sha256/u);
  assert.throws(() => shimCreateHash("sha256").update("a").digest("base64"), /hex/u);
});
