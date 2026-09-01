import assert from "node:assert/strict";
import test from "node:test";

import { canonicalize, canonicalStringify, isResourceId } from "@hypit/protocol";

test("canonical values have stable key order and preserve array order", () => {
  assert.equal(canonicalStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.notEqual(canonicalStringify([1, 2]), canonicalStringify([2, 1]));
});

test("canonicalization normalizes negative zero and is idempotent", () => {
  const once = canonicalize({ z: [1, { y: "x" }], a: -0 });
  assert.deepEqual(canonicalize(once), once);
  assert.ok(Object.is((once as { a: number }).a, 0));
});

test("values without one JSON meaning are refused", () => {
  assert.throws(() => canonicalize({ a: Number.NaN }), /must be finite/u);
  assert.throws(() => canonicalize({ a: undefined }), /is undefined/u);
});

test("Resource ids retain their narrow execution-reference syntax", () => {
  assert.equal(isResourceId("res_fixture-resource"), true);
  assert.equal(isResourceId("fixture-resource"), false);
  assert.equal(isResourceId("md5:abc"), false);
});
