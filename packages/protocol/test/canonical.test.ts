import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalize,
  canonicalStringify,
  digestOf,
  isDigest,
  recordDigest,
  semanticRecordsDigest,
} from "@narratage/protocol";

/**
 * Every identity in the system is a digest of a canonical value: Record
 * identity, Operation identity, configuration identity, package locks. So these
 * tests are about one property — two values that mean the same thing must
 * digest the same, and two that mean different things must not.
 */

test("key order is not meaning, so it cannot change a digest", () => {
  assert.equal(
    digestOf({ a: 1, b: { c: 2, d: 3 } }),
    digestOf({ b: { d: 3, c: 2 }, a: 1 }),
  );
  assert.equal(canonicalStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test("array order is meaning, so it does change a digest", () => {
  assert.notEqual(digestOf([1, 2]), digestOf([2, 1]));
});

test("a value's type is part of what it means", () => {
  assert.notEqual(digestOf({ a: 1 }), digestOf({ a: "1" }));
  assert.notEqual(digestOf({ a: null }), digestOf({ a: false }));
  assert.notEqual(digestOf({ a: 0 }), digestOf({ a: [] }));
  assert.notEqual(digestOf([]), digestOf({}));
});

test("negative zero is zero, because nothing downstream can mean the difference", () => {
  assert.equal(digestOf({ a: -0 }), digestOf({ a: 0 }));
  assert.ok(Object.is((canonicalize({ a: -0 }) as { a: number }).a, 0));
});

test("canonicalizing an already canonical value changes nothing", () => {
  const value = { z: [1, { y: "x" }], a: null, n: 2.5 };
  const once = canonicalize(value);
  assert.deepEqual(canonicalize(once), once);
  assert.equal(digestOf(once), digestOf(value));
});

test("a value that cannot mean one thing is refused, and says which path", () => {
  const refusals: readonly [unknown, RegExp][] = [
    [{ a: Number.NaN }, /must be finite/u],
    [{ a: Number.POSITIVE_INFINITY }, /must be finite/u],
    [{ a: undefined }, /is undefined/u],
    [{ a: () => 1 }, /contains function/u],
    [{ a: 1n }, /contains bigint/u],
    [{ a: Symbol("s") }, /contains symbol/u],
    [{ a: new Date(0) }, /must be a plain object/u],
    [{ a: new Map() }, /must be a plain object/u],
  ];
  for (const [value, message] of refusals) assert.throws(() => canonicalize(value), message);

  // An accessor could answer differently on a second read, so it is not a value.
  const accessor = {};
  Object.defineProperty(accessor, "a", { get: () => 1, enumerable: true });
  assert.throws(() => canonicalize(accessor), /must be a data property/u);
});

test("a cycle has no canonical form, in either shape", () => {
  const object: Record<string, unknown> = {};
  object.self = object;
  assert.throws(() => canonicalize(object), /contains a cycle/u);
  const array: unknown[] = [];
  array.push(array);
  assert.throws(() => canonicalize(array), /contains a cycle/u);

  // The same value twice is not a cycle.
  const shared = { a: 1 };
  assert.doesNotThrow(() => canonicalize({ left: shared, right: shared }));
});

test("a digest is recognisable as one", () => {
  assert.ok(isDigest(digestOf({})));
  assert.equal(isDigest("sha256:"), false);
  assert.equal(isDigest("md5:abc"), false);
  assert.equal(isDigest(`sha256:${"g".repeat(64)}`), false);
});

test("a Record's identity includes its Type, and a set of Records is order-free", () => {
  const type = { module: { name: "@x/m", version: "1" }, name: "T" } as const;
  const other = { module: { name: "@x/m", version: "1" }, name: "U" } as const;
  const value = { kind: "inline", value: { a: 1 } } as const;
  assert.notEqual(recordDigest(type, value), recordDigest(other, value));

  const records = [
    { id: "r1", type, value, conformance: "exact" },
    { id: "r2", type: other, value, conformance: "exact" },
  ] as never;
  const reversed = [records[1], records[0]] as never;
  assert.equal(semanticRecordsDigest(records), semanticRecordsDigest(reversed));
});

/**
 * Pins.
 *
 * These are not testing that sha256 works. They exist so that changing how a
 * value is canonicalized cannot be a quiet change: every archived Build, every
 * package lock and every recorded Runtime Profile is addressed by these bytes.
 * Editing a constant here is a deliberate act that a reviewer can see; a
 * silently different digest is not.
 */
test("the canonical form of these values is fixed, and changing it is a visible act", () => {
  assert.equal(digestOf({}),
    "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
  assert.equal(digestOf([]),
    "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945");
  assert.equal(digestOf({ contract: "svml.example@1", count: 1, ok: true, none: null }),
    "sha256:2b702b25c218cdbc1f242c1125cee07f648f503af78b0dd48d5f9743f22934c9");
  // Non-ASCII must not depend on an escaping choice.
  assert.equal(digestOf({ zh: "口播稿", nested: { a: [1, "1", false] } }),
    "sha256:96519d6160460ea2b76578b1303fec47e9c3d53b012dce8738a3129126baea59");
  assert.equal(
    recordDigest({ module: { name: "@x/m", version: "1" }, name: "T" },
      { kind: "inline", value: { a: 1 } } as never),
    "sha256:e231ae28cdbe95ed1fe2d5837e3c4d82e71805ad26b941e8a90c745e4e50cdbc");
});
