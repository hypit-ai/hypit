import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { planStillVideoSegments, bindStillVideoSource } from "../src/index.js";
import { mediaOperationsComponent } from "../src/component.js";
import { mediaOperationsProducers } from "../src/manifest.js";

const planStill = mediaOperationsComponent.producers.find(
  (item) => item.producer.name === mediaOperationsProducers.planStill.name,
)!;

function plan(duration: unknown, frameRate = { numerator: 30, denominator: 1 }) {
  return planStill.handler({ inputs: {
    duration: { value: (duration) },
    clock: { value: ({ frameRate }) },
    layout: { value: ({ weights: [1] }) },
  } } as never);
}

test("StillVideo converts an exact TemporalDuration to whole frames without rounding", async () => {
  const result = await plan({ unit: "seconds", numerator: 3, denominator: 2 });
  assert.equal(result.kind, "output");

  await assert.rejects(
    async () => plan({ unit: "milliseconds", value: 1 }),
    /must resolve to a positive whole frame count/u,
  );
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
