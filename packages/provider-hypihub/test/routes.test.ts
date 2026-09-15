import assert from "node:assert/strict";
import test from "node:test";
import type { EndpointSupport } from "@hypit/endpoint-kit";
import type { CanonicalValue } from "@hypit/protocol";

import { hypiHubRoutes } from "../src/routes.js";

const image = {
  kind: "blob" as const,
  resource: "res_hypihub-route-1",
  size: 3,
  mediaType: "image/png",
};

const resolve = async () => "data:image/png;base64,AQID";
const resolveAudio = async () => "data:audio/wav;base64,AQID";

test("HypiHub GPT image requests use canonical edit references and the authored resolution tier", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "gpt-image-2");
  assert.ok(route);
  const result = await route.compile({
    ports: {
      prompt: ["edit"],
      aspectRatio: ["1:1"],
      resolution: ["1K"],
      background: ["transparent"],
      images: [{ role: "image", artifact: image }],
    },
  }, resolve);
  assert.equal(result.model, "gpt-image-2");
  assert.deepEqual(result.input, {
    prompt: "edit",
    aspect_ratio: "1:1",
    resolution: "1K",
    background: "transparent",
    reference_images: [{ url: "data:image/png;base64,AQID" }],
  });

  const unsupported = { ports: {
    prompt: ["cutout"], aspectRatio: ["1:1"], resolution: ["2K"], background: ["opaque"],
  } } as unknown as CanonicalValue;
  assert.deepEqual(route.supports?.({
    capability: route.capability,
    returns: route.returns,
    constraints: unsupported,
  }), {
    status: "unsupported",
    reason: "HypiHub GPT Image 2 accepts the background option only at 1K; omit it at 2K",
  });
  await assert.rejects(route.compile(unsupported, resolve), /background option only at 1K/u);

  for (const constraints of [
    { ports: { prompt: ["portrait"], aspectRatio: ["5:4"], resolution: ["2K"] } },
    { ports: { prompt: ["portrait"], aspectRatio: ["3:1"], resolution: ["4K"] } },
  ]) {
    const support: EndpointSupport | undefined = route.supports?.({
      capability: route.capability,
      returns: route.returns,
      constraints,
    });
    assert.equal(support?.status, "unsupported");
    assert.match(support?.status === "unsupported" ? support.reason : "", /HypiHub GPT Image 2/u);
  }

  for (const constraints of [
    { ports: { prompt: ["portrait"], aspectRatio: ["auto"], resolution: ["4K"] } },
    { ports: { prompt: ["portrait"], aspectRatio: ["5:4"], resolution: ["4K"] } },
  ]) {
    assert.deepEqual(route.supports?.({
      capability: route.capability,
      returns: route.returns,
      constraints,
    }), { status: "supported" });
  }
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
  assert.equal(result.model, "minimax-h3");
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
        { role: "image", artifact: { ...image, resource: "res_hypihub-route-2" } },
      ],
    },
  }, resolve);
  assert.equal(result.model, "seedance-2");
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
  assert.equal(result.model, "minimax-h3");
  assert.deepEqual(result.input, {
    prompt: "animate", seconds: 6, aspect_ratio: "16:9",
    resolution: "2k",
    reference_image_urls: ["data:image/png;base64,AQID"],
  });
});

test("HypiHub preserves reference-video roles for one or several videos", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "minimax-h3");
  assert.ok(route);
  const video = { ...image, mediaType: "video/mp4" };
  const resolveVideo = async (artifact: typeof video) => `https://hypit.ai/files/${artifact.resource.slice(-1)}.mp4`;

  const single = await route.compile({ ports: {
    prompt: ["animate"], duration: [6],
    referenceVideo: [{ role: "video", artifact: video }],
  } }, resolveVideo);
  assert.deepEqual(single.input, {
    prompt: "animate", seconds: 6, resolution: "2k",
    reference_videos: ["https://hypit.ai/files/1.mp4"],
  });

  const multiple = await route.compile({ ports: {
    prompt: ["animate"], duration: [6],
    referenceVideo: [
      { role: "video", artifact: video },
      { role: "video", artifact: { ...video, resource: "res_hypihub-route-2" } },
    ],
  } }, resolveVideo);
  assert.deepEqual(multiple.input, {
    prompt: "animate", seconds: 6, resolution: "2k",
    reference_videos: ["https://hypit.ai/files/1.mp4", "https://hypit.ai/files/2.mp4"],
  });
});

test("HypiHub MiMo Speech mappings use the public audio speech fields", async () => {
  const voiceDesign = hypiHubRoutes.find((item) => item.capability.name === "mimo-v2.5-tts-voicedesign");
  assert.ok(voiceDesign);
  const result = await voiceDesign.compile({
    ports: { text: ["hello"], voiceDescription: ["warm and calm"] },
  }, resolve);
  assert.equal(result.model, "mimo-v2.5-tts-voicedesign");
  assert.deepEqual(result.input, { input: "hello", voice_description: "warm and calm" });

  const voiceClone = hypiHubRoutes.find((item) => item.capability.name === "mimo-v2.5-tts-voiceclone");
  assert.ok(voiceClone);
  const cloned = await voiceClone.compile({
    ports: {
      text: ["hello again"],
      instruction: ["quiet and direct"],
      voiceReference: [{ role: "audio", artifact: { ...image, mediaType: "audio/wav" } }],
    },
  }, resolveAudio);
  assert.equal(cloned.model, "mimo-v2.5-tts-voiceclone");
  assert.deepEqual(cloned.input, {
    input: "hello again",
    prompt: "quiet and direct",
    reference_audio: ["data:audio/wav;base64,AQID"],
  });
});

test("Seedance person metadata reaches resource transport without changing video request fields", async () => {
  for (const port of ["referenceImage", "referenceVideo", "firstFrame", "lastFrame"] as const) {
    const route = hypiHubRoutes.find((item) => item.capability.name === "seedance-2-mini")!;
    for (const flag of [true, false, undefined]) {
      const fields = flag === undefined ? {} : { personReference: flag };
      const seen: unknown[] = [];
      const result = await route.compile({ ports: {
        prompt: ["animate"], duration: [5],
        [port]: [{ role: port === "referenceVideo" ? "video" : "image", artifact: image, fields }],
      } }, async (_artifact, metadata) => { seen.push(metadata); return "https://media.test/ref"; });
      assert.deepEqual(seen, [fields]);
      const wireField = { referenceImage: "reference_image_urls", referenceVideo: "reference_videos", firstFrame: "first_frame", lastFrame: "last_frame" }[port];
      assert.deepEqual((result.input as Record<string, unknown>)[wireField], port.startsWith("reference") ? ["https://media.test/ref"] : "https://media.test/ref");
      assert.equal(JSON.stringify(result.input).includes("person"), false);
    }
  }
});

test("exact model identity survives reference mode and preview selection", async () => {
  const lite = hypiHubRoutes.find((item) => item.capability.name === "seedream-5-lite")!;
  const preview = hypiHubRoutes.find((item) => item.capability.name === "grok-imagine-video-1.5-preview")!;
  for (const images of [[], [{ role: "image", artifact: image }]]) {
    const request = { ports: { prompt: ["A scene"], ...(images.length ? { images } : {}) } };
    assert.equal((await lite.compile(request, resolve)).model,
      "seedream-5-lite");
    assert.equal((await preview.compile(request, resolve)).model, "grok-imagine-video-1.5-preview");
  }
});
