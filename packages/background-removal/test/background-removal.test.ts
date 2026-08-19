import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import { artifactTypes } from "@hypit/artifact";
import {
  backgroundRemovalCapabilities, backgroundRemovalComponent, backgroundRemovalFragment, backgroundRemovalManifest,
} from "@hypit/background-removal";

test("Background Removal is one image edge to one exact external Need", async () => {
  assert.deepEqual(backgroundRemovalFragment.inputs.map((input) => input.name), ["source"]);
  assert.deepEqual(backgroundRemovalFragment.exports.map((output) => output.name), ["image"]);
  assert.deepEqual(backgroundRemovalManifest.capabilities, [{ name: "remove-background", returns: artifactTypes.blob }]);
  const source = { kind: "blob" as const, digest: fixtureDigest("portrait"), size: 456, mediaType: "image/jpeg" };
  const result = await backgroundRemovalComponent.producers[0]!.handler({ inputs: { source: { value: source } } } as never);
  assert.deepEqual(result.needs.image, { source });
  assert.deepEqual(backgroundRemovalCapabilities.remove.module.version, "1");
});
