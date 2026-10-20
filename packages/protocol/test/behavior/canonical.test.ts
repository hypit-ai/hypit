import assert from "node:assert/strict";
import test from "node:test";

// Protocol owns canonical identity, references and recursive Value shape.

import {
  assertBlobRef,
  assertBuildId,
  assertOrderedBuildId,
  blobRefSchema,
  buildIdCreatedAt,
  canonicalize,
  canonicalStringify,
  isResourceId,
  mapValueBlobs,
  normalizeValue,
  orderedBuildId,
  valueBlobRefs,
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
  assert.equal(isResourceId("res_a"), true);
  assert.equal(isResourceId("res_fixture-resource"), true);
  assert.equal(isResourceId(`res_${"a".repeat(400)}`), true);
  assert.equal(isResourceId("fixture-resource"), false);
  assert.equal(isResourceId("md5:abc"), false);
  assert.equal(isResourceId("res_has space"), false);
});

test("BlobRef keeps one opaque structural schema and one Protocol runtime assertion", () => {
  assert.deepEqual(blobRefSchema(), { kind: "blob" });
  assert.deepEqual(blobRefSchema(["image/png"]), { kind: "blob", mediaTypes: ["image/png"] });
  assert.doesNotThrow(() => assertBlobRef({ kind: "blob", resource: "res_a", size: 0, mediaType: "image/png" }));
  assert.doesNotThrow(() => assertBlobRef({
    kind: "blob", resource: `res_${"a".repeat(400)}`, size: 1, mediaType: "application/octet-stream",
  }));
  for (const value of [
    { kind: "blob", resource: "sha256:abc", size: 1, mediaType: "image/png" },
    { kind: "blob", resource: "res_a", size: -1, mediaType: "image/png" },
    { kind: "blob", resource: "res_a", size: 1, mediaType: "" },
  ]) assert.throws(() => assertBlobRef(value), /BlobRef/u);
});

test("one recursive Value admits BlobRef leaves at every depth", () => {
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
    kind: "blob", resource: "sha256:old", size: 1, mediaType: "image/png",
  } }), /nested.*BlobRef/u);
  assert.throws(() => normalizeValue({
    kind: "blob", resource: "res_image", size: 1, mediaType: "image/png", digest: "legacy",
  }), /BlobRef/u);
  assert.throws(() => normalizeValue({ value: Number.NaN }), /finite/u);
  assert.throws(() => normalizeValue({ value: undefined }), /undefined/u);
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
