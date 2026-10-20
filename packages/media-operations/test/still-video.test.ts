import assert from "node:assert/strict";
import test from "node:test";

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
