import assert from "node:assert/strict";
import test from "node:test";
import type { GenerationArtifactUrlResolver } from "@hypit/generation/provider";
import type { EndpointSupport } from "@hypit/endpoint";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import { sealMinimaxH3Request } from "@hypit/minimax-h3";

import { hypiHubRoutes } from "../../src/routes.js";
import type { HypiHubRoute } from "../../src/routes.js";
import { sealGptImage2Request } from "@hypit/gpt-image";

async function compile(route: HypiHubRoute, constraints: CanonicalValue, resolve: GenerationArtifactUrlResolver) {
  return await route.prepare(constraints).compile(resolve);
}

const image: BlobRef = {
  kind: "blob" as const,
  resource: "res_hypihub-route-1",
  size: 3,
  mediaType: "image/png",
};

const resolve = async () => "data:image/png;base64,AQID";
const resolveAudio: GenerationArtifactUrlResolver = async (artifact) => artifact.mediaType.startsWith("image/")
  ? "data:image/png;base64,AQID"
  : "data:audio/wav;base64,AQID";

test("service restrictions leave the model request valid and reject before resolving uploads", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "gpt-image-2")!;
  const request = sealGptImage2Request({
    prompt: ["edit the cutout"], aspectRatio: ["1:1"], resolution: ["2K"],
    background: ["opaque"], images: [{ role: "image", artifact: image }],
  });
  const constraints = request as unknown as CanonicalValue;
  assert.equal(route.supports!({ capability: route.capability, returns: route.returns, constraints }).status, "unsupported");
  let resolved = 0;
  const upload: GenerationArtifactUrlResolver = async () => { resolved++; return "https://example.test/reference.png"; };
  await assert.rejects(compile(route, constraints, upload), /background option only at 1K/);
  assert.equal(resolved, 0);

  const supported = sealGptImage2Request({ ...request.fields, resolution: ["1K"] }) as unknown as CanonicalValue;
  assert.equal(route.supports!({ capability: route.capability, returns: route.returns, constraints: supported }).status, "supported");
  await compile(route, supported, upload);
  assert.equal(resolved, 1);
});

test("HypiHub GPT image requests use canonical edit references and the authored resolution tier", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "gpt-image-2");
  assert.ok(route);
  const result = await compile(route, {
    fields: {
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

  const unsupported = { fields: {
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
  await assert.rejects(compile(route, unsupported, resolve), /background option only at 1K/u);

  for (const constraints of [
    { fields: { prompt: ["portrait"], aspectRatio: ["5:4"], resolution: ["2K"] } },
    { fields: { prompt: ["portrait"], aspectRatio: ["3:1"], resolution: ["4K"] } },
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
    { fields: { prompt: ["portrait"], aspectRatio: ["auto"], resolution: ["4K"] } },
    { fields: { prompt: ["portrait"], aspectRatio: ["5:4"], resolution: ["4K"] } },
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
  const result = await compile(route, sealMinimaxH3Request({
      prompt: ["animate"],
      duration: [5],
      firstFrame: [{ role: "image", artifact: image }],
  }) as unknown as CanonicalValue, resolve);
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
  const result = await compile(route, sealMinimaxH3Request({
      prompt: ["animate"],
      duration: [5],
      referenceImage: [{ role: "image", artifact: image }],
      referenceAudio: [{ role: "audio", artifact: { ...image, mediaType: "audio/wav" } }],
  }) as unknown as CanonicalValue, resolveAudio);
  assert.deepEqual(result.input, {
    prompt: "animate", seconds: 5, resolution: "2k",
    reference_image_urls: ["data:image/png;base64,AQID"],
    reference_audios: ["data:audio/wav;base64,AQID"],
  });
});

test("HypiHub Seedance sends reference images through the public top-level field", async () => {
  const route = hypiHubRoutes.find((item) => item.capability.name === "seedance-2");
  assert.ok(route);
  const result = await compile(route, {
    fields: {
      prompt: ["animate"],
      duration: [5],
      resolution: ["720p"],
      aspectRatio: ["16:9"],
      generateAudio: [true],
      webSearch: [false],
      referenceImage: [
        { role: "image", artifact: image, fields: { personReference: true } },
        { role: "image", artifact: { ...image, resource: "res_hypihub-route-2" }, fields: { personReference: false } },
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
  const result = await compile(route, sealMinimaxH3Request({
    prompt: ["animate"], duration: [6], aspectRatio: ["16:9"],
    referenceImage: [{ role: "image", artifact: image }],
  }) as unknown as CanonicalValue, resolve);
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

  const single = await compile(route, sealMinimaxH3Request({
    prompt: ["animate"], duration: [6],
    referenceVideo: [{ role: "video", artifact: video }],
  }) as unknown as CanonicalValue, resolveVideo);
  assert.deepEqual(single.input, {
    prompt: "animate", seconds: 6, resolution: "2k",
    reference_videos: ["https://hypit.ai/files/1.mp4"],
  });

  const multiple = await compile(route, sealMinimaxH3Request({
    prompt: ["animate"], duration: [6],
    referenceVideo: [
      { role: "video", artifact: video },
      { role: "video", artifact: { ...video, resource: "res_hypihub-route-2" } },
    ],
  }) as unknown as CanonicalValue, resolveVideo);
  assert.deepEqual(multiple.input, {
    prompt: "animate", seconds: 6, resolution: "2k",
    reference_videos: ["https://hypit.ai/files/1.mp4", "https://hypit.ai/files/2.mp4"],
  });
});

test("HypiHub MiMo Speech mappings use the public audio speech fields", async () => {
  const voiceDesign = hypiHubRoutes.find((item) => item.capability.name === "mimo-v2.5-tts-voicedesign");
  assert.ok(voiceDesign);
  const result = await compile(voiceDesign, {
    fields: { text: ["hello"], voiceDescription: ["warm and calm"] },
  }, resolve);
  assert.equal(result.model, "mimo-v2.5-tts-voicedesign");
  assert.deepEqual(result.input, { input: "hello", voice_description: "warm and calm" });

  const voiceClone = hypiHubRoutes.find((item) => item.capability.name === "mimo-v2.5-tts-voiceclone");
  assert.ok(voiceClone);
  const cloned = await compile(voiceClone, {
    fields: {
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
  for (const route of hypiHubRoutes.filter((item) => item.capability.module.name === "@hypit/seedance")) {
    for (const field of ["referenceImage", "referenceVideo", "firstFrame", "lastFrame"] as const) {
      for (const flag of [true, false]) {
        const fields = { personReference: flag };
        const seen: unknown[] = [];
        const result = await compile(route, { fields: {
          prompt: ["animate"], duration: [5],
          [field]: [{ role: field === "referenceVideo" ? "video" : "image", artifact: image, fields }],
        } }, async (_artifact, metadata) => { seen.push(metadata); return "https://media.test/ref"; });
        assert.deepEqual(seen, [fields]);
        const wireField = { referenceImage: "reference_image_urls", referenceVideo: "reference_videos", firstFrame: "first_frame", lastFrame: "last_frame" }[field];
        assert.deepEqual((result.input as Record<string, unknown>)[wireField], field.startsWith("reference") ? ["https://media.test/ref"] : "https://media.test/ref");
        assert.equal(JSON.stringify(result.input).includes("person"), false);
      }
    }
  }
});

test("exact model identity survives reference mode and preview selection", async () => {
  const lite = hypiHubRoutes.find((item) => item.capability.name === "seedream-5-lite")!;
  const preview = hypiHubRoutes.find((item) => item.capability.name === "grok-imagine-video-1.5-preview")!;
  for (const images of [[], [{ role: "image", artifact: image }]]) {
    const request = { fields: { prompt: ["A scene"], ...(images.length ? { images } : {}) } };
    assert.equal((await compile(lite, request, resolve)).model, "seedream-5-lite");
    assert.equal((await compile(preview, request, resolve)).model, "grok-imagine-video-1.5-preview");
  }
});

test("canonical image models keep generation and edit operations distinct", async () => {
  for (const name of ["gpt-image-2", "seedream-5-lite", "nano-banana-2", "nano-banana-pro"]) {
    const route = hypiHubRoutes.find((item) => item.capability.name === name)!;
    for (const images of [[], [{ role: "image", artifact: image }]]) {
      const prepared = route.prepare({ fields: { prompt: ["A scene"], images } });
      assert.equal(prepared.model, name);
      assert.equal(prepared.operation, images.length ? "image_edits" : "images");
      const compiled = await prepared.compile(resolve);
      assert.equal(compiled.model, name);
      assert.deepEqual((compiled.input as Record<string, CanonicalValue>).reference_images,
        images.length ? [{ url: "data:image/png;base64,AQID" }] : []);
    }
  }
});
