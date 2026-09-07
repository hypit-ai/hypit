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

test("HypiHub GPT image requests preserve canonical edit references and independent image dimensions", async () => {
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
    resolution: "1k",
    reference_images: [{ url: "data:image/png;base64,AQID" }],
  });
});

test("HypiHub image-to-video requests preserve Hypit's first-frame semantics", async () => {
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
    first_frame: "data:image/png;base64,AQID",
  });
});

test("HypiHub sends audio references through the public top-level field", async () => {
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
    reference_audios: ["data:audio/wav;base64,AQID"],
  });
});

test("HypiHub Seedance sends reference images through the public top-level field", async () => {
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
    reference_image_urls: ["data:image/png;base64,AQID", "data:image/png;base64,AQID"],
  });
});

test("HypiHub MiniMax reference mode preserves the public image array", async () => {
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
    reference_image_urls: ["data:image/png;base64,AQID"],
  });
});

test("HypiHub uses ref_video_url for one video and the public array for multiple videos", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "minimax-h3");
  assert.ok(route);
  const video = { ...image, mediaType: "video/mp4" };
  const resolveVideo = async (artifact: typeof video) => `https://hypit.ai/files/${artifact.digest.slice(-1)}.mp4`;

  const single = await route.compile({ ports: {
    prompt: ["animate"], duration: [6],
    referenceVideo: [{ role: "video", artifact: video }],
  } }, resolveVideo);
  assert.deepEqual(single.input, {
    prompt: "animate", seconds: 6, resolution: "2k",
    ref_video_url: "https://hypit.ai/files/1.mp4",
  });

  const multiple = await route.compile({ ports: {
    prompt: ["animate"], duration: [6],
    referenceVideo: [
      { role: "video", artifact: video },
      { role: "video", artifact: { ...video, digest: `sha256:${"2".repeat(64)}` } },
    ],
  } }, resolveVideo);
  assert.deepEqual(multiple.input, {
    prompt: "animate", seconds: 6, resolution: "2k",
    reference_videos: ["https://hypit.ai/files/1.mp4", "https://hypit.ai/files/2.mp4"],
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

for (const capability of ["gpt-image-2", "nano-banana-2", "nano-banana-pro"]) {
  for (const aspect of ["1:1", "16:9", "9:16"]) {
    for (const tier of ["1K", "2K", "4K"]) {
      test(`HypiHub ${capability} preserves ${aspect} at ${tier}`, async () => {
        const route = hypiHubRoutes.find(item => item.capability.name === capability);
        assert.ok(route);
        const result = await route.compile({ ports: {
          prompt: ["a paper boat"], aspectRatio: [aspect], resolution: [tier],
        } }, resolve);
        assert.deepEqual(result.input, {
          prompt: "a paper boat", aspect_ratio: aspect, resolution: tier.toLowerCase(),
        });
      });
    }
  }
}
