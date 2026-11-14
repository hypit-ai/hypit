import assert from "node:assert/strict";
import test from "node:test";

// The Value boundary owns canonical representation and recursive Blob leaves.

import { assertBlobRef, blobRefSchema, canonicalize, canonicalStringify, isResourceId, mapValueBlobs, normalizeValue, valueBlobRefs } from "@hypit/protocol";

test("canonical values have stable key order and preserve array order", () => {
  assert.equal(canonicalStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.notEqual(canonicalStringify([1, 2]), canonicalStringify([2, 1]));
});
test("canonical values preserve every own object key as data", () => {
  const input = Object.fromEntries([["__proto__", { kept: true }], ["constructor", "value"]]);
  const canonical = canonicalize(input) as Record<string, unknown>;
  assert.equal(Object.hasOwn(canonical, "__proto__"), true);
  assert.deepEqual(canonical["__proto__"], { kept: true });
  assert.equal(canonical.constructor, "value");
  assert.deepEqual(normalizeValue(input), canonical);
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
  assert.equal(isResourceId("res_a"), true);
  assert.equal(isResourceId("res_fixture-resource"), true);
  assert.equal(isResourceId(`res_${"a".repeat(400)}`), true);
  assert.equal(isResourceId("fixture-resource"), false);
  assert.equal(isResourceId("md5:abc"), false);
  assert.equal(isResourceId("res_has space"), false);
});

test("BlobRef keeps one opaque structural schema and one Value-boundary assertion", () => {
  assert.deepEqual(blobRefSchema(), { kind: "blob" });
  assert.deepEqual(blobRefSchema(["image/png"]), { kind: "blob", mediaTypes: ["image/png"] });
  assert.doesNotThrow(() => assertBlobRef({ kind: "blob", resource: "res_a", size: 0, mediaType: "image/png" }));
  assert.doesNotThrow(() => assertBlobRef({
    kind: "blob", resource: `res_${"a".repeat(400)}`, size: 1, mediaType: "application/octet-stream",
  }));
  for (const value of [
    { kind: "blob", resource: "artifact/abc", size: 1, mediaType: "image/png" },
    { kind: "blob", resource: "res_a", size: -1, mediaType: "image/png" },
    { kind: "blob", resource: "res_a", size: 1, mediaType: "" },
  ]) assert.throws(() => assertBlobRef(value), /BlobRef/u);
});

test("one recursive Value accepts BlobRef leaves at every depth", () => {
  const image = { kind: "blob" as const, resource: "res_image" as const, size: 4, mediaType: "image/png" };
  const audio = { kind: "blob" as const, resource: "res_audio" as const, size: 8, mediaType: "audio/wav" };
  const normalized = normalizeValue({ z: [image, { sound: audio }], a: -0 });
  assert.deepEqual(normalized, { a: 0, z: [image, { sound: audio }] });
  assert.deepEqual(valueBlobRefs(normalized), [
    { at: ["z", 0], blob: image },
    { at: ["z", 1, "sound"], blob: audio },
  ]);
  const paths: unknown[] = [];
  assert.deepEqual(mapValueBlobs(normalized, (blob, at) => {
    paths.push([at, blob.resource]);
    return null;
  }), { a: 0, z: [null, { sound: null }] });
  assert.deepEqual(paths, [
    [["z", 0], "res_image"],
    [["z", 1, "sound"], "res_audio"],
  ]);
});

test("the reserved blob tag is validated by the same Value boundary at every depth", () => {
  assert.throws(() => normalizeValue({ nested: {
    kind: "blob", resource: "artifact/old", size: 1, mediaType: "image/png",
  } }), /nested.*BlobRef/u);
  assert.throws(() => normalizeValue({
    kind: "blob", resource: "res_image", size: 1, mediaType: "image/png", extra: true,
  }), /BlobRef/u);
  assert.throws(() => normalizeValue({ value: Number.NaN }), /finite/u);
  assert.throws(() => normalizeValue({ value: undefined }), /undefined/u);
});
