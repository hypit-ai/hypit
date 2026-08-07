import assert from "node:assert/strict";
import test from "node:test";

import { registerTypeValidatorFacets } from "@narratage/component-kit";
import { MemoryArtifactStore } from "@narratage/driver-node";
import {
  generationComponent,
  generationProducers,
  generationTypes,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
  verifyGeneratedImageSet,
} from "@narratage/generation";
import { TypeValidatorRegistry } from "@narratage/validation";

test("generated media validators bind artifacts and result contents", async () => {
  const store = new MemoryArtifactStore();
  const image = await store.put(new Uint8Array([4, 5, 6]), "image/png");
  const result = sealGeneratedImageSet({
    contract: "svml.generated-image-set@1",
    images: [image],
  });
  verifyGeneratedImageSet(result);
  assert.throws(() => verifyGeneratedImageSet({ ...result, images: [] }), /empty/u);
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, generationComponent.validators);
  assert.ok(validators.resolve(generationTypes.imageSet));
});

test("the primary-video projection returns the ordered Product member as a Blob value", async () => {
  const store = new MemoryArtifactStore();
  const first = await store.put(new Uint8Array([1, 2, 3]), "video/mp4");
  const second = await store.put(new Uint8Array([4, 5, 6]), "video/mp4");
  const set = sealGeneratedVideoSet({
    contract: "svml.generated-video-set@1",
    videos: [first, second],
  });
  const facet = generationComponent.producers.find((item) =>
    item.producer.name === generationProducers.primaryVideo.name);
  assert.ok(facet);
  const result = await facet.handler({
    inputs: { set: { value: { kind: "inline", value: set } } },
  } as never);
  assert.ok("video" in result.outputs);
  assert.deepEqual(result.outputs.video, first);
  assert.deepEqual(result.needs, {});
});
