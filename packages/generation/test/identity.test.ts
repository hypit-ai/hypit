import assert from "node:assert/strict";
import test from "node:test";

import { registerTypeValidatorFacets } from "@hypit/component-kit";
import { MemoryResourceStore } from "@hypit/driver-node";
import {
  generationComponent,
  generationProducers,
  generationTypes,
  sealGeneratedAudioSet,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
  verifyGeneratedImageSet,
  verifyGeneratedAudioSet,
} from "@hypit/generation";
import { TypeValidatorRegistry } from "@hypit/validation";

test("generated media validators bind artifacts and result contents", async () => {
  const store = new MemoryResourceStore();
  const image = await store.put(new Uint8Array([4, 5, 6]), "image/png");
  const result = sealGeneratedImageSet({
    images: [image],
  });
  verifyGeneratedImageSet(result);
  assert.throws(() => verifyGeneratedImageSet({ ...result, images: [] }), /empty/u);
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, generationComponent.validators);
  assert.ok(validators.resolve(generationTypes.imageSet));
});

test("generated audio is an ordinary Resource-backed media result", async () => {
  const store = new MemoryResourceStore();
  const audio = await store.put(new Uint8Array([7, 8, 9]), "audio/wav");
  const set = sealGeneratedAudioSet({ audios: [audio] });
  verifyGeneratedAudioSet(set);
  const facet = generationComponent.producers.find((item) =>
    item.producer.name === generationProducers.primaryAudio.name);
  assert.ok(facet);
  const result = await facet.handler({ inputs: { set: { value: { kind: "inline", value: set } } } } as never);
  assert.ok("audio" in result.outputs);
  assert.deepEqual(result.outputs.audio, audio);
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, generationComponent.validators);
  assert.ok(validators.resolve(generationTypes.audioSet));
});

test("the primary-video projection returns the ordered Product member as a Blob value", async () => {
  const store = new MemoryResourceStore();
  const first = await store.put(new Uint8Array([1, 2, 3]), "video/mp4");
  const second = await store.put(new Uint8Array([4, 5, 6]), "video/mp4");
  const set = sealGeneratedVideoSet({
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
