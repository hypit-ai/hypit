import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBuildId,
  assertOrderedBuildId,
  buildIdCreatedAt,
  canonicalize,
  canonicalStringify,
  isResourceId,
  orderedBuildId,
} from "@hypit/protocol";

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

test("Build ids cannot address a parent or nested path", () => {
  assert.doesNotThrow(() => assertBuildId("build-19"));
  for (const value of ["..", ".", "episode/19", "episode\\19", " padded "]) {
    assert.throws(() => assertBuildId(value), /Build id/u);
  }
});

test("public Build ids carry sortable UTC submission time without content semantics", () => {
  const earlier = orderedBuildId(Date.parse("2026-09-02T10:20:30.123Z"), "0000000001");
  const later = orderedBuildId(Date.parse("2026-09-02T10:20:30.124Z"), "0000000000");
  assert.equal(earlier, "bld_20260902T102030123Z_0000000001");
  assert.equal(buildIdCreatedAt(earlier), Date.parse("2026-09-02T10:20:30.123Z"));
  assert.ok(earlier < later);
  assert.doesNotThrow(() => assertOrderedBuildId(earlier));
  assert.throws(() => assertOrderedBuildId("build-19"), /UTC submission time/u);
});
