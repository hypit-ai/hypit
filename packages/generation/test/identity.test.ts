import assert from "node:assert/strict";
import test from "node:test";
import type { BlobRef } from "@hypit/protocol";

import {
  generationComponent,
  generationProducers,
  sealGeneratedAudioSet,
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
  verifyGeneratedImageSet,
  verifyGeneratedAudioSet,
  verifyGeneratedVideoSet,
} from "@hypit/generation";

const artifact = (name: string, mediaType: string, size = 3): BlobRef => ({
  kind: "blob" as const,
  resource: `res_generation_${name}`,
  size,
  mediaType,
});

test("generated media sets reject empty results", () => {
  const image = artifact("image", "image/png");
  const result = sealGeneratedImageSet({
    images: [image],
  });
  verifyGeneratedImageSet(result);
  assert.throws(() => verifyGeneratedImageSet({ ...result, images: [] }), /empty/u);
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
  const audio = artifact("audio", "audio/wav");
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
  const first = artifact("video-first", "video/mp4");
  const second = artifact("video-second", "video/mp4");
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
