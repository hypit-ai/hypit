import assert from "node:assert/strict";
import test from "node:test";

import { exactTemporalValue } from "@hypit/temporal";

import { hypitPackage } from "../src/activation.js";
import { temporalManifest, temporalRefinements, temporalTypes } from "../src/index.js";

test("Temporal Graph adapts pure values without publishing generic operations", () => {
  assert.equal(temporalManifest.name, "@hypit/temporal-graph");
  assert.deepEqual(temporalManifest.producers, []);
  assert.deepEqual(hypitPackage.modules.map(({ manifest }) => manifest.name), ["@hypit/temporal-graph"]);
  const exact = temporalRefinements.find((candidate) => candidate.type.name === temporalTypes.exactValue.name);
  assert(exact !== undefined);
  assert.doesNotThrow(() => exact.handler({
    type: temporalTypes.exactValue,
    value: exactTemporalValue({ numerator: 1n, denominator: 3n }),
  }));
});
