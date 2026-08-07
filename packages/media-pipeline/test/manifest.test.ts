import { videoContractManifests } from "../../test-support/video-domain.js";
import { registerTypeValidatorFacets } from "@narratage/component-kit";
import { mediaTypes } from "@narratage/media";
import assert from "node:assert/strict";
import test from "node:test";

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
  assert.equal(synchronizedMediaFragment.exports[0]?.type.name, mediaTypes.synchronized.name);
});

test("media identities and selection requests have package-owned semantic validators", () => {
  const registry = new TypeValidatorRegistry();
  for (const component of mediaPipelineComponents) {
    registerTypeValidatorFacets(registry, component.validators);
  }
  assert.ok(registry.resolve(mediaTypes.inspection));
  assert.ok(registry.resolve(mediaTypes.streamSelection));
  assert.ok(registry.resolve(mediaTypes.synchronized));
  assert.ok(registry.resolve(mediaTypes.timelineAudio));
  assert.ok(registry.resolve(mediaTypes.muxed));
  assert.ok(registry.resolve(mediaPipelineTypes.selectionRequest));
  assert.ok(registry.resolve(mediaPipelineTypes.audioProgramPlan));
});
