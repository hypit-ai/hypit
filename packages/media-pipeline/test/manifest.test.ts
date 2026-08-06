import assert from "node:assert/strict";
import test from "node:test";

import {
  contractTypes,
  videoContractManifests,
} from "@svml/contracts";
import {
  createResolvedClosure,
  link,
} from "@svml/core";
import { verifyGraphFragment } from "@svml/elaborator";
import { TypeValidatorRegistry } from "@svml/validation";

import {
  mediaPipelineComponents,
  mediaPipelineManifest,
  mediaPipelineTypes,
  synchronizedMediaFragment,
} from "../src/index.js";

test("the media pipeline is an ordinary Fragment over public media contracts", () => {
  const closure = createResolvedClosure([...videoContractManifests, mediaPipelineManifest]);
  const program = link(closure, []);
  verifyGraphFragment(program, synchronizedMediaFragment);
  assert.deepEqual(synchronizedMediaFragment.operations.map((operation) => operation.id), [
    "inspect", "normalize", "select",
  ]);
  assert.equal(synchronizedMediaFragment.exports[0]?.type.name, contractTypes.synchronizedMedia.name);
});

test("media identities and selection requests have package-owned semantic validators", () => {
  const registry = new TypeValidatorRegistry();
  for (const component of mediaPipelineComponents) component.installValidators(registry);
  assert.ok(registry.resolve(contractTypes.mediaInspection));
  assert.ok(registry.resolve(contractTypes.mediaStreamSelection));
  assert.ok(registry.resolve(contractTypes.synchronizedMedia));
  assert.ok(registry.resolve(contractTypes.timelineAudio));
  assert.ok(registry.resolve(contractTypes.muxedMedia));
  assert.ok(registry.resolve(mediaPipelineTypes.selectionRequest));
  assert.ok(registry.resolve(mediaPipelineTypes.audioProgramPlan));
});
