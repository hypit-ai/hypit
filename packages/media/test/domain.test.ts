import assert from "node:assert/strict";
import test from "node:test";

import { mediaLocalTemporalDomain, verifySynchronizedMedia } from "../src/index.js";
import type { SynchronizedMedia } from "../src/index.js";
import { fixtureResource } from "../../../test/fixture-resource.js";

const media: SynchronizedMedia = {
  frameDomain: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 60 },
  visual: {
    artifact: { kind: "blob", resource: fixtureResource("domain:visual"), size: 1, mediaType: "video/mp4" },
    width: 1920, height: 1080,
  },
  audio: { artifact: { kind: "blob", resource: fixtureResource("domain:audio"), size: 1, mediaType: "audio/wav" } },
};

test("normalized media publishes a factual local temporal domain without program position", () => {
  const domain = mediaLocalTemporalDomain("opening-local", media);
  assert.deepEqual(domain, { id: "opening-local", ...media.frameDomain });
  assert.equal("timelineId" in domain, false);
  assert.equal("media" in domain, false);
});

test("SynchronizedMedia validation reports malformed nested facts at their boundary", () => {
  assert.throws(() => verifySynchronizedMedia({ frameDomain: null, visual: {} }),
    /SynchronizedMedia\.frameDomain must be an object/u);
  assert.throws(() => verifySynchronizedMedia({ frameDomain: media.frameDomain, visual: 1 }),
    /SynchronizedMedia\.visual must be an object/u);
  assert.throws(() => verifySynchronizedMedia({ frameDomain: media.frameDomain, audio: "wav" }),
    /SynchronizedMedia\.audio must be an object/u);
});
