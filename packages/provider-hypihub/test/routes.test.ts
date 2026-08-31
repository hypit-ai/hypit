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
const resolveAudio = async () => "data:audio/wav;base64,AQID";

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
    resolution: "2k",
    input_reference: "data:image/png;base64,AQID",
  });
});

test("HypiHub preserves video/audio reference arrays for its upstream passthrough", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "minimax-h3");
  assert.ok(route);
  const result = await route.compile({
    ports: {
      prompt: ["animate"],
      duration: [5],
      referenceAudio: [{ role: "audio", artifact: { ...image, mediaType: "audio/wav" } }],
    },
  }, resolveAudio);
  assert.deepEqual(result.input, {
    prompt: "animate", seconds: 5, resolution: "2k",
    extra: { reference_audios: ["data:audio/wav;base64,AQID"] },
  });
});

test("HypiHub Seedance multimodal references ride in the public extra passthrough", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "seedance-2");
  assert.ok(route);
  const result = await route.compile({
    ports: {
      prompt: ["animate"],
      duration: [5],
      resolution: ["720p"],
      aspectRatio: ["16:9"],
      generateAudio: [true],
      webSearch: [false],
      referenceImage: [
        { role: "image", artifact: image },
        { role: "image", artifact: { ...image, digest: `sha256:${"2".repeat(64)}` } },
      ],
    },
  }, resolve);
  assert.equal(result.model, "bytedance/seedance-2");
  assert.deepEqual(result.input, {
    prompt: "animate",
    seconds: 5,
    resolution: "720p",
    aspect_ratio: "16:9",
    generate_audio: true,
    web_search: false,
    extra: { reference_image_urls: ["data:image/png;base64,AQID", "data:image/png;base64,AQID"] },
  });
});

test("HypiHub MiniMax reference mode preserves image arrays in extra", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "minimax-h3");
  assert.ok(route);
  const result = await route.compile({ ports: {
    prompt: ["animate"], duration: [6], aspectRatio: ["16:9"],
    referenceImage: [{ role: "image", artifact: image }],
  } }, resolve);
  assert.equal(result.model, "minimax-h3/reference-to-video");
  assert.deepEqual(result.input, {
    prompt: "animate", seconds: 6, aspect_ratio: "16:9",
    resolution: "2k",
    extra: { reference_image_urls: ["data:image/png;base64,AQID"] },
  });
});

test("HypiHub MiMo TTS mappings use the public audio speech fields", async () => {
  const voiceDesign = hypiHubRoutes.find((item) => item.capability.name === "mimo-v2.5-tts-voicedesign");
  assert.ok(voiceDesign);
  const result = await voiceDesign.compile({
    ports: { text: ["hello"], voiceDescription: ["warm and calm"] },
  }, resolve);
  assert.equal(result.model, "mimo-v2.5-tts-voicedesign");
  assert.deepEqual(result.input, { input: "hello", voice_description: "warm and calm" });
});

test("HypiHub MiMo voice clone sends the upstream-required bare base64 sample", async () => {
  const voiceClone = hypiHubRoutes.find((item) => item.capability.name === "mimo-v2.5-tts-voiceclone");
  assert.ok(voiceClone);
  const result = await voiceClone.compile({
    ports: {
      text: ["hello"],
      sample: [{ role: "audio", artifact: { ...image, mediaType: "audio/wav" } }],
    },
  }, resolveAudio);
  assert.equal(result.model, "mimo-v2.5-tts-voiceclone");
  assert.deepEqual(result.input, { input: "hello", voice: "AQID" });
});
