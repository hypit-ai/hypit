import assert from "node:assert/strict";
import test from "node:test";

import { hypiHubRoutes } from "../src/routes.js";

const image = {
  kind: "blob" as const,
  digest: `sha256:${"1".repeat(64)}`,
  size: 3,
  mediaType: "image/png",
};

const resolve = async () => "data:image/png;base64,AQID";

test("HypiHub GPT image requests use canonical edit references and size dimensions", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "gpt-image-2");
  assert.ok(route);
  const result = await route.compile({
    ports: {
      prompt: ["edit"],
      aspectRatio: ["1:1"],
      resolution: ["1K"],
      images: [{ role: "image", artifact: image }],
    },
  }, resolve);
  assert.equal(result.model, "gpt-image-2-image-to-image");
  assert.deepEqual(result.input, {
    prompt: "edit",
    aspect_ratio: "1:1",
    size: "1024x1024",
    reference_images: [{ url: "data:image/png;base64,AQID" }],
  });
});

test("HypiHub image-to-video requests use input_reference", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "minimax-h3");
  assert.ok(route);
  const result = await route.compile({
    ports: {
      prompt: ["animate"],
      duration: [5],
      firstFrame: [{ role: "image", artifact: image }],
    },
  }, resolve);
  assert.equal(result.model, "minimax-h3/image-to-video");
  assert.deepEqual(result.input, {
    prompt: "animate",
    seconds: 5,
    input_reference: "data:image/png;base64,AQID",
  });
});

test("HypiHub rejects reference video/audio that cannot be represented by its public API", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "minimax-h3");
  assert.ok(route);
  await assert.rejects(() => route.compile({
    ports: {
      prompt: ["animate"],
      duration: [5],
      referenceAudio: [{ role: "audio", artifact: { ...image, mediaType: "audio/wav" } }],
    },
  }, resolve), /does not support reference audio/);
});
