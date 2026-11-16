import assert from "node:assert/strict";
import test from "node:test";

import { verifySynchronizedMedia } from "../src/index.js";
import type { SynchronizedMedia } from "../src/index.js";
import { fixtureResource } from "../../../test/fixture-resource.js";

const media: SynchronizedMedia = {
  frameDomain: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 60 },
  visual: {
    artifact: { kind: "blob", resource: fixtureResource("identity:visual"), size: 1, mediaType: "video/mp4" },
    width: 1920, height: 1080,
  },
  audio: { artifact: { kind: "blob", resource: fixtureResource("identity:audio"), size: 1, mediaType: "audio/wav" } },
};

test("verifySynchronizedMedia accepts a well-formed value", () => {
  assert.doesNotThrow(() => verifySynchronizedMedia(media));
});

test("verifySynchronizedMedia rejects a missing frame domain with a stated error", () => {
  const { frameDomain: _omitted, ...withoutFrameDomain } = media;
  assert.throws(
    () => verifySynchronizedMedia(withoutFrameDomain),
    /SynchronizedMedia\.frameDomain must be an object/,
  );
});

test("verifySynchronizedMedia rejects a non-object frame domain with a stated error", () => {
  for (const frameDomain of [null, "30/1", 30] as const) {
    assert.throws(
      () => verifySynchronizedMedia({ ...media, frameDomain }),
      /SynchronizedMedia\.frameDomain must be an object/,
    );
  }
});
