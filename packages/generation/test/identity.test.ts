import assert from "node:assert/strict";
import test from "node:test";

import { registerTypeValidatorFacets } from "@svml/component-kit";
import { MemoryArtifactStore } from "@svml/driver-node";
import {
  generationComponent,
  generationTypes,
  sealGeneratedImageSet,
  verifyGeneratedImageSet,
} from "@svml/generation";
import { TypeValidatorRegistry } from "@svml/validation";

test("generated media validators bind artifacts and result contents", async () => {
  const store = new MemoryArtifactStore();
  const image = await store.put(new Uint8Array([4, 5, 6]), "image/png");
  const result = sealGeneratedImageSet({
    contract: "svml.generated-image-set@1",
    model: "gpt-image-2",
    requestDigest: image.digest,
    images: [image],
  });
  verifyGeneratedImageSet(result);
  assert.throws(() => verifyGeneratedImageSet({ ...result, model: "tampered" }), /result digest differs/u);
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, generationComponent.validators);
  assert.ok(validators.resolve(generationTypes.imageSet));
});
