import { blobTypes } from "@hypit/blob";
import { mediaTypes } from "@hypit/media";
import { timelineTypes } from "@hypit/timeline";
import { temporalTypes } from "@hypit/temporal";
import { recipeType } from "@hypit/recipe";
import { installRunFragmentFacets, RunFragmentRegistry } from "@hypit/run";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { mediaOperationsTypes, createStillVideoFragment, planStillVideoSegments, bindStillVideoSource, extractAudioFragment, extractFrameFragment, preparedMediaFragment, transformMediaFragment, stillVideoFragment } from "../src/index.js";
import { hypitPackage } from "../src/activation.js";

test("the package exposes StillVideo as an ordinary Run Fragment", () => {
  const fragments = new RunFragmentRegistry();
  installRunFragmentFacets(hypitPackage.facets, fragments);
  assert.equal(fragments.resolve("@hypit/media-operations@1", "still-video"), stillVideoFragment);
});

test("still video frames are whole and every picture holds at least one", () => {
  assert.deepEqual(planStillVideoSegments(180, [1, 2, 1]).map((item) => item.endFrameExclusive - item.startFrame), [45, 90, 45]);
  assert.deepEqual(planStillVideoSegments(10, [1, 1, 1]).map((item) => item.endFrameExclusive - item.startFrame), [4, 3, 3],
    "the leftover frame goes to the earliest of equal remainders");
  assert.deepEqual(planStillVideoSegments(10, [1, 1.5, 1]).map((item) => item.endFrameExclusive - item.startFrame), [3, 4, 3]);
  assert.deepEqual(planStillVideoSegments(3, [100, 1, 1]).map((item) => item.endFrameExclusive - item.startFrame), [1, 1, 1]);
  assert.throws(() => planStillVideoSegments(2, [1, 1, 1]), /each picture needs at least one/u);
  const bound = bindStillVideoSource(
    { frameRate: { numerator: 30, denominator: 1 }, frameCount: 2, output: { container: "mp4", codec: "h264", pixelFormat: "yuv420p" },
      segments: [{ startFrame: 0, endFrameExclusive: 1 }, { startFrame: 1, endFrameExclusive: 2 }] },
    { kind: "blob", resource: fixtureResource("still:first"), size: 1, mediaType: "image/png" },
  );
  assert.equal(bound.segments[0]?.source?.mediaType, "image/png");
  assert.equal(bound.segments[1]?.source, undefined, "pictures bind in order, one per step");
});
