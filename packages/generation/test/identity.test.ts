import assert from "node:assert/strict";
import test from "node:test";

import { registerTypeRefinements } from "@hypit/refinement";
import { MemoryResourceStore } from "@hypit/executor";
import {
  generationComponent,
  generationProducers,
  generationTypes,
  sealGeneratedAudioSet,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
  verifyGeneratedImageSet,
  verifyGeneratedAudioSet,
  verifyGeneratedVideoSet,
} from "@hypit/generation";
import { RefinementRegistry } from "@hypit/refinement";

test("generated media refinements bind artifacts and result contents", async () => {
  const store = new MemoryResourceStore();
  const image = await store.put(new Uint8Array([4, 5, 6]), "image/png");
  const result = sealGeneratedImageSet({
    images: [image],
  });
  verifyGeneratedImageSet(result);
  assert.throws(() => verifyGeneratedImageSet({ ...result, images: [] }), /empty/u);
  const refinements = new RefinementRegistry();
  registerTypeRefinements(refinements, generationComponent.refinements);
  assert.ok(refinements.resolve(generationTypes.imageSet));
});

test("Generation accepts Protocol ResourceIds without imposing a digest length", () => {
  verifyGeneratedImageSet({
    images: [{ kind: "blob", resource: "res_a", size: 1, mediaType: "image/png" }],
  });
  verifyGeneratedImageSet({
    images: [{ kind: "blob", resource: `res_${"a".repeat(400)}`, size: 1, mediaType: "image/png" }],
  });
});

test("generated Products accept any non-empty number of actual artifacts", () => {
  const artifacts = (count: number, mediaType: string) => Array.from({ length: count }, (_, index) => ({
    kind: "blob" as const,
    resource: `res_generated_${index}`,
    size: index + 1,
    mediaType,
  }));
  verifyGeneratedImageSet({ images: artifacts(17, "image/png") });
  verifyGeneratedVideoSet({ videos: artifacts(9, "video/mp4") });
  verifyGeneratedAudioSet({ audios: artifacts(17, "audio/wav") });
});

test("generated audio is an ordinary Resource-backed media result", async () => {
  const store = new MemoryResourceStore();
  const audio = await store.put(new Uint8Array([7, 8, 9]), "audio/wav");
  const set = sealGeneratedAudioSet({ audios: [audio] });
  verifyGeneratedAudioSet(set);
  const facet = generationComponent.producers.find((item) =>
    item.producer.name === generationProducers.primaryAudio.name);
  assert.ok(facet);
  const result = await facet.handler({ inputs: { set: { value: (set) } } } as never);
  assert.equal(result.kind, "output");
  assert.deepEqual(result.value, audio);
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
    inputs: { set: { value: (set) } },
  } as never);
  assert.equal(result.kind, "output");
  assert.deepEqual(result.value, first);
});
