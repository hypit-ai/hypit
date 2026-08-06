import assert from "node:assert/strict";
import test from "node:test";

import { createResolvedClosure, digestOf } from "@svml/core";
import { mediaManifest, narrativeManifest } from "@svml/contracts";
import { verifyGraphFragment } from "@svml/elaborator";
import {
  geminiOmniDefinition,
  geminiOmniManifest,
  sealGeminiOmniRequest,
} from "@svml/gemini-omni";
import { MemoryArtifactStore } from "@svml/driver-node";
import { generationManifest } from "@svml/generation";
import { gptImageDefinition, gptImageManifest, sealGptImage2Request } from "@svml/gpt-image";
import { grokImagineDefinition, grokImagineManifest, sealGrokImagineRequest } from "@svml/grok-imagine";
import { minimaxH3Definition, minimaxH3Manifest, sealMinimaxH3Request } from "@svml/minimax-h3";
import { nanoBananaDefinition, nanoBananaManifest, sealNanoBananaRequest } from "@svml/nano-banana";
import { kieModelCatalog } from "@svml/provider-kie";
import { seedanceDefinition, seedanceManifest, sealSeedanceRequest } from "@svml/seedance";
import { seedreamDefinition, seedreamManifest, sealSeedreamRequest } from "@svml/seedream";
import type { LinkedProgram } from "@svml/protocol";

test("the selected KIE release is seven exact model families and no Grok image capability", () => {
  assert.equal(kieModelCatalog.length, 16);
  assert.equal(kieModelCatalog.some((item) => item.key.startsWith("grok-imagine.") && item.result === "image"), false);
  assert.deepEqual(
    [...new Set(kieModelCatalog.map((item) => item.key.split(".", 1)[0]))].sort(),
    ["gemini-omni", "gpt-image-2", "grok-imagine", "minimax-h3", "nano-banana", "seedance", "seedream"],
  );
});

test("all model manifests close over the shared generation contract and every Fragment verifies", () => {
  const definitions = [
    seedanceDefinition,
    minimaxH3Definition,
    geminiOmniDefinition,
    grokImagineDefinition,
    gptImageDefinition,
    nanoBananaDefinition,
    seedreamDefinition,
  ];
  const closure = createResolvedClosure([
    mediaManifest,
    narrativeManifest,
    generationManifest,
    seedanceManifest,
    minimaxH3Manifest,
    geminiOmniManifest,
    grokImagineManifest,
    gptImageManifest,
    nanoBananaManifest,
    seedreamManifest,
  ]);
  const program: LinkedProgram = {
    closure,
    modules: [],
    records: [],
    semanticDigest: digestOf("kie-model-fragment-test"),
  };
  definitions.forEach((definition) => {
    Object.values(definition.endpoints).forEach((endpoint) => verifyGraphFragment(program, endpoint.fragment));
  });
});

test("Gemini Omni enforces the weighted seven-unit reference quota", async () => {
  const artifacts = new MemoryArtifactStore();
  const image = await artifacts.put(new Uint8Array([1]), "image/png");
  const video = await artifacts.put(new Uint8Array([2]), "video/mp4");
  assert.throws(() => sealGeminiOmniRequest({
    contract: "svml.gemini-omni-request@1",
    model: "gemini-omni-video",
    prompt: "Use every reference.",
    durationSec: 4,
    aspectRatio: "16:9",
    resolution: "720p",
    images: [image, image, image],
    videos: [{ artifact: video, startSec: 0, endSec: 1 }],
    characterIds: ["a", "b", "c"],
  }), /quota is 8/u);
});

test("Gemini Omni binds its documented output controls into the KIE request", async () => {
  const request = sealGeminiOmniRequest({
    contract: "svml.gemini-omni-request@1",
    model: "gemini-omni-video",
    prompt: "A glass sphere rolls across a blue floor.",
    durationSec: 4,
    aspectRatio: "16:9",
    resolution: "720p",
    seed: 42,
  });
  const adapter = kieModelCatalog.find((item) => item.key === "gemini-omni.video");
  assert.ok(adapter);
  const task = await adapter.task(request, async () => "https://upload.test/reference");
  assert.deepEqual(task.input, {
    prompt: request.prompt,
    duration: "4",
    aspect_ratio: "16:9",
    resolution: "720p",
    seed: 42,
  });
});

test("Seedream safety policy is explicit author content and contributes to request identity", () => {
  const unchecked = sealSeedreamRequest({
    contract: "svml.seedream-5-lite-request@1",
    model: "seedream-5-lite",
    mode: "text",
    prompt: "A fashion editorial.",
    aspectRatio: "3:4",
    quality: "basic",
    outputFormat: "png",
    nsfwCheck: false,
  });
  const checked = sealSeedreamRequest({
    contract: "svml.seedream-5-lite-request@1",
    model: "seedream-5-lite",
    mode: "text",
    prompt: "A fashion editorial.",
    aspectRatio: "3:4",
    quality: "basic",
    outputFormat: "png",
    nsfwCheck: true,
  });
  assert.equal(unchecked.nsfwCheck, false);
  assert.notEqual(unchecked.requestDigest, checked.requestDigest);
});

test("all sixteen exact capabilities translate to their documented KIE model slug", async () => {
  const store = new MemoryArtifactStore();
  const image = await store.put(new Uint8Array([1]), "image/png");
  const video = await store.put(new Uint8Array([2]), "video/mp4");
  const audio = await store.put(new Uint8Array([3]), "audio/wav");
  const seedance = (model: "seedance-2" | "seedance-2-fast" | "seedance-2-mini") => sealSeedanceRequest({
    contract: "svml.seedance-request@1",
    model,
    prompt: "A studio shot.",
    mode: { kind: "text" },
    resolution: model === "seedance-2" ? "1080p" : "720p",
    aspectRatio: "16:9",
    durationSec: 5,
    generateAudio: false,
    webSearch: false,
  });
  const commonH3 = {
    contract: "svml.minimax-h3-request@1" as const,
    model: "minimax-h3" as const,
    prompt: "A studio shot.",
    durationSec: 6,
  };
  const commonGrok = {
    contract: "svml.grok-imagine-video-request@1" as const,
    prompt: "A studio shot.",
    aspectRatio: "16:9",
    resolution: "480p" as const,
    durationSec: 6,
  };
  const commonGpt = {
    contract: "svml.gpt-image-2-request@1" as const,
    model: "gpt-image-2" as const,
    prompt: "A studio portrait.",
    aspectRatio: "auto",
  };
  const commonSeedream = {
    contract: "svml.seedream-5-lite-request@1" as const,
    model: "seedream-5-lite" as const,
    prompt: "A studio portrait.",
    aspectRatio: "1:1",
    quality: "basic" as const,
    outputFormat: "png" as const,
    nsfwCheck: true,
  };
  const cases = [
    ["seedance.standard", seedance("seedance-2"), "bytedance/seedance-2"],
    ["seedance.fast", seedance("seedance-2-fast"), "bytedance/seedance-2-fast"],
    ["seedance.mini", seedance("seedance-2-mini"), "bytedance/seedance-2-mini"],
    ["minimax-h3.text", sealMinimaxH3Request({ ...commonH3, mode: "text", aspectRatio: "16:9" }), "minimax-h3/text-to-video"],
    ["minimax-h3.frames", sealMinimaxH3Request({ ...commonH3, mode: "frames", firstFrame: image }), "minimax-h3/image-to-video"],
    ["minimax-h3.reference", sealMinimaxH3Request({
      ...commonH3,
      mode: "reference",
      aspectRatio: "adaptive",
      references: [
        { kind: "image", artifact: image },
        { kind: "video", artifact: video },
        { kind: "audio", artifact: audio },
      ],
    }), "minimax-h3/reference-to-video"],
    ["gemini-omni.video", sealGeminiOmniRequest({
      contract: "svml.gemini-omni-request@1",
      model: "gemini-omni-video",
      prompt: "A studio shot.",
      durationSec: 4,
      aspectRatio: "16:9",
      resolution: "720p",
      images: [image],
    }), "gemini-omni-video"],
    ["grok-imagine.text", sealGrokImagineRequest({ ...commonGrok, model: "grok-imagine-video", mode: "text" }), "grok-imagine/text-to-video"],
    ["grok-imagine.image", sealGrokImagineRequest({
      ...commonGrok,
      model: "grok-imagine-video",
      mode: "image",
      images: [image],
    }), "grok-imagine/image-to-video"],
    ["grok-imagine.preview-1.5", sealGrokImagineRequest({
      ...commonGrok,
      model: "grok-imagine-video-1.5-preview",
      mode: "preview-1.5",
    }), "grok-imagine-video-1-5-preview"],
    ["gpt-image-2.text", sealGptImage2Request({ ...commonGpt, mode: "text" }), "gpt-image-2-text-to-image"],
    ["gpt-image-2.image", sealGptImage2Request({ ...commonGpt, mode: "image", images: [image] }), "gpt-image-2-image-to-image"],
    ["nano-banana.v2", sealNanoBananaRequest({
      contract: "svml.nano-banana-request@1",
      model: "nano-banana-2",
      prompt: "A studio portrait.",
      aspectRatio: "auto",
      resolution: "2K",
      outputFormat: "jpg",
    }), "nano-banana-2"],
    ["nano-banana.pro", sealNanoBananaRequest({
      contract: "svml.nano-banana-request@1",
      model: "nano-banana-pro",
      prompt: "A studio portrait.",
      images: [image],
      aspectRatio: "1:1",
      resolution: "1K",
      outputFormat: "png",
    }), "nano-banana-pro"],
    ["seedream.text", sealSeedreamRequest({ ...commonSeedream, mode: "text" }), "seedream/5-lite-text-to-image"],
    ["seedream.image", sealSeedreamRequest({ ...commonSeedream, mode: "image", images: [image] }), "seedream/5-lite-image-to-image"],
  ] as const;
  for (const [key, request, expectedModel] of cases) {
    const item = kieModelCatalog.find((candidate) => candidate.key === key);
    assert.ok(item, key);
    const task = await item.task(request, async (artifact) => `https://upload.test/${artifact.digest}`);
    assert.equal(task.model, expectedModel, key);
  }
});
