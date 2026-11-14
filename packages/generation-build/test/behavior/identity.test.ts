import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBuildId,
  assertOrderedBuildId,
  buildIdCreatedAt,
  orderedBuildId,
} from "@hypit/generation-build";

test("Build ids are non-empty opaque Host identities", () => {
  assert.doesNotThrow(() => assertBuildId("build-19"));
  for (const value of ["", " ", " padded "]) {
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
