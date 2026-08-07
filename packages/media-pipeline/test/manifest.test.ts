import assert from "node:assert/strict";
import test from "node:test";

import { registerTypeValidatorFacets } from "@narratage/component-kit";
import {
  contractTypes,
  videoContractManifests,
} from "@narratage/contracts";
import {
  createResolvedClosure,
  link,
} from "@narratage/core";
import { verifyGraphFragment } from "@narratage/elaborator";
import { TypeValidatorRegistry } from "@narratage/validation";

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
  for (const component of mediaPipelineComponents) {
    registerTypeValidatorFacets(registry, component.validators);
  }
  assert.ok(registry.resolve(contractTypes.mediaInspection));
  assert.ok(registry.resolve(contractTypes.mediaStreamSelection));
  assert.ok(registry.resolve(contractTypes.synchronizedMedia));
  assert.ok(registry.resolve(contractTypes.timelineAudio));
  assert.ok(registry.resolve(contractTypes.muxedMedia));
  assert.ok(registry.resolve(mediaPipelineTypes.selectionRequest));
  assert.ok(registry.resolve(mediaPipelineTypes.audioProgramPlan));
});
