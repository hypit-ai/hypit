import assert from "node:assert/strict";
import test from "node:test";
import { videoContractManifests } from "../../../test/support/video-domain.js";
import { createResolvedClosure, digestOf } from "@narratage/core";

import { verifyGraphFragment } from "@narratage/elaborator";
import {
  geminiOmniDefinition,
  geminiOmniManifest,
  sealGeminiOmniRequest,
} from "@narratage/gemini-omni";
import { MemoryArtifactStore } from "@narratage/driver-node";
import {
  assertMappingCoversPorts,
  compileWireRequest,
  generationManifest,
} from "@narratage/generation";
import type { GenerationPortTable } from "@narratage/generation";
import {
  gptImageDefinition,
  gptImageManifest,
  sealGptImage2Request,
} from "@narratage/gpt-image";
import {
  grokImagineDefinition,
  grokImagineManifest,
  sealGrokImagineRequest,
} from "@narratage/grok-imagine";
import {
  minimaxH3Definition,
  minimaxH3Manifest,
  sealMinimaxH3Request,
} from "@narratage/minimax-h3";
import {
  nanoBananaDefinition,
  nanoBananaManifest,
  sealNanoBananaRequest,
} from "@narratage/nano-banana";
import { kieModelCatalog } from "@narratage/provider-kie";
import { seedanceDefinition, seedanceManifest, seedancePorts, sealSeedanceRequest } from "@narratage/seedance";
import {
  seedreamDefinition,
  seedreamManifest,
  sealSeedreamRequest,
} from "@narratage/seedream";
import type { CapabilityRef, LinkedProgram } from "@narratage/protocol";
import { textManifest } from "@narratage/text";

/**
 * Every exact model this repository ships, paired with the Capability it publishes.
 * The Capability carries the module version, so a mapping written for an older model
 * version fails here rather than at submission time.
 */
const modelCapabilities: readonly { readonly ports: GenerationPortTable; readonly capability: CapabilityRef }[] = [
  seedanceDefinition, minimaxH3Definition, geminiOmniDefinition, grokImagineDefinition,
  gptImageDefinition, nanoBananaDefinition, seedreamDefinition,
].flatMap((definition) => Object.values(definition.endpoints)
  .map((endpoint) => ({ ports: endpoint.ports, capability: endpoint.capability })));

function capabilityKey(ref: CapabilityRef): string {
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

const upload = async (artifact: { readonly digest: string }) => `https://upload.test/${artifact.digest}`;

test("the selected KIE release is seven exact model families and no Grok image capability", () => {
  assert.equal(kieModelCatalog.length, 12);
  assert.equal(
    kieModelCatalog.some((item) => item.capability.name.startsWith("grok-") && item.result === "image"),
    false,
  );
  assert.deepEqual(
    [...new Set(kieModelCatalog.map((item) => item.capability.module.name))].sort(),
    [
      "@narratage/gemini-omni",
      "@narratage/gpt-image",
      "@narratage/grok-imagine",
      "@narratage/minimax-h3",
      "@narratage/nano-banana",
      "@narratage/seedance",
      "@narratage/seedream",
    ],
  );
});

/**
 * The check the old hand-written translators could not perform. Forgetting a
 * reference role or an item field used to surface only after paid generation
 * returned the wrong result; it now fails here.
 */
test("the KIE mapping covers every port every exact model declares", () => {
  assert.equal(modelCapabilities.length, kieModelCatalog.length);
  const mappings = new Map(kieModelCatalog.map((item) => [capabilityKey(item.capability), item]));
  for (const { ports, capability } of modelCapabilities) {
    // Matched on the full Capability, version included: a stale mapping cannot pass by name alone.
    const mapping = mappings.get(capabilityKey(capability));
    assert.ok(mapping, `KIE declares no mapping for ${capabilityKey(capability)}`);
    assertMappingCoversPorts(ports, mapping);
  }
});

test("dropping one reference modality from a mapping fails coverage before any spend", () => {
  const seedance = kieModelCatalog.find((item) => item.capability.name === "seedance-2-mini");
  assert.ok(seedance);
  const { referenceAudio: _dropped, ...withoutAudio } = seedance.fields;
  assert.throws(
    () => assertMappingCoversPorts(seedancePorts["seedance-2-mini"], { ...seedance, fields: withoutAudio }),
    /does not cover port referenceAudio/u,
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
    ...videoContractManifests,
    textManifest,
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
    prompt: ["Use every reference."],
    duration: [4],
    aspectRatio: ["16:9"],
    resolution: ["720p"],
    images: [
      { role: "image", artifact: image },
      { role: "image", artifact: image },
      { role: "image", artifact: image },
    ],
    excerpts: [{ role: "video", artifact: video, fields: { startSec: 0, endSec: 1 } }],
    characterIds: ["a", "b", "c"],
  }), /uses 8 of its 7 shared/u);
});

test("Gemini Omni binds its documented output controls into the KIE request", async () => {
  const request = sealGeminiOmniRequest({
    prompt: ["A glass sphere rolls across a blue floor."],
    duration: [4],
    aspectRatio: ["16:9"],
    resolution: ["720p"],
    seed: [42],
  });
  const mapping = kieModelCatalog.find((item) => item.capability.name === "gemini-omni-video");
  assert.ok(mapping);
  const task = await compileWireRequest(mapping, request, upload);
  assert.deepEqual(task.input, {
    prompt: "A glass sphere rolls across a blue floor.",
    duration: "4",
    aspect_ratio: "16:9",
    resolution: "720p",
    seed: 42,
  });
});

test("Seedream safety policy is explicit author content and contributes to request identity", () => {
  const base = {
    prompt: ["A fashion editorial."],
    aspectRatio: ["3:4"],
    quality: ["basic"],
    outputFormat: ["png"],
  };
  const unchecked = sealSeedreamRequest({ ...base, nsfwCheck: [false] });
  const checked = sealSeedreamRequest({ ...base, nsfwCheck: [true] });
  assert.deepEqual(unchecked.ports.nsfwCheck, [false]);
  assert.notEqual(digestOf(unchecked), digestOf(checked));
});

test("all twelve exact capabilities route to their documented KIE model slug", async () => {
  const store = new MemoryArtifactStore();
  const image = await store.put(new Uint8Array([1]), "image/png");
  const video = await store.put(new Uint8Array([2]), "video/mp4");
  const audio = await store.put(new Uint8Array([3]), "audio/wav");
  const seedance = (model: "seedance-2" | "seedance-2-fast" | "seedance-2-mini" | "seedance-2.5") => sealSeedanceRequest(model, {
    prompt: ["A studio shot."],
    resolution: [model === "seedance-2" ? "1080p" : "720p"],
    aspectRatio: ["16:9"],
    duration: [5],
    generateAudio: [false],
    webSearch: [false],
  });
  const commonGrok = {
    prompt: ["A studio shot."],
    aspectRatio: ["16:9"],
    resolution: ["480p"],
    duration: [6],
  } as const;
  const commonSeedream = {
    prompt: ["A studio portrait."],
    aspectRatio: ["1:1"],
    quality: ["basic"],
    outputFormat: ["png"],
    nsfwCheck: [true],
  };
  const cases = [
    ["seedance-2", seedance("seedance-2"), "bytedance/seedance-2"],
    ["seedance-2-fast", seedance("seedance-2-fast"), "bytedance/seedance-2-fast"],
    ["seedance-2-mini", seedance("seedance-2-mini"), "bytedance/seedance-2-mini"],
    ["seedance-2.5", seedance("seedance-2.5"), "bytedance/seedance-2-5"],
    ["minimax-h3", sealMinimaxH3Request({
      prompt: ["A studio shot."],
      duration: [6],
      aspectRatio: ["16:9"],
    }), "minimax-h3/text-to-video"],
    ["minimax-h3", sealMinimaxH3Request({
      prompt: ["A studio shot."],
      duration: [6],
      firstFrame: [{ role: "image", artifact: image }],
    }), "minimax-h3/image-to-video"],
    ["minimax-h3", sealMinimaxH3Request({
      prompt: ["A studio shot."],
      duration: [6],
      referenceImage: [{ role: "image", artifact: image }],
      referenceVideo: [{ role: "video", artifact: video }],
      referenceAudio: [{ role: "audio", artifact: audio }],
    }), "minimax-h3/reference-to-video"],
    ["gemini-omni-video", sealGeminiOmniRequest({
      prompt: ["A studio shot."],
      duration: [4],
      aspectRatio: ["16:9"],
      resolution: ["720p"],
      images: [{ role: "image", artifact: image }],
    }), "gemini-omni-video"],
    ["grok-imagine-video", sealGrokImagineRequest("grok-imagine-video", commonGrok), "grok-imagine/text-to-video"],
    ["grok-imagine-video", sealGrokImagineRequest("grok-imagine-video", {
      ...commonGrok,
      images: [{ role: "image", artifact: image }],
    }), "grok-imagine/image-to-video"],
    ["grok-imagine-video-1.5-preview",
      sealGrokImagineRequest("grok-imagine-video-1.5-preview", commonGrok),
      "grok-imagine-video-1-5-preview"],
    ["gpt-image-2", sealGptImage2Request({
      prompt: ["A studio portrait."],
      aspectRatio: ["auto"],
      resolution: ["1K"],
    }), "gpt-image-2-text-to-image"],
    ["gpt-image-2", sealGptImage2Request({
      prompt: ["A studio portrait."],
      aspectRatio: ["auto"],
      resolution: ["1K"],
      images: [{ role: "image", artifact: image }],
    }), "gpt-image-2-image-to-image"],
    ["nano-banana-2", sealNanoBananaRequest("nano-banana-2", {
      prompt: ["A studio portrait."],
      aspectRatio: ["auto"],
      resolution: ["2K"],
      outputFormat: ["jpg"],
    }), "nano-banana-2"],
    ["nano-banana-pro", sealNanoBananaRequest("nano-banana-pro", {
      prompt: ["A studio portrait."],
      images: [{ role: "image", artifact: image }],
      aspectRatio: ["1:1"],
      resolution: ["1K"],
      outputFormat: ["png"],
    }), "nano-banana-pro"],
    ["seedream-5-lite", sealSeedreamRequest(commonSeedream), "seedream/5-lite-text-to-image"],
    ["seedream-5-lite", sealSeedreamRequest({
      ...commonSeedream,
      images: [{ role: "image", artifact: image }],
    }), "seedream/5-lite-image-to-image"],
  ] as const;
  for (const [model, request, expectedModel] of cases) {
    const mapping = kieModelCatalog.find((candidate) => candidate.capability.name === model);
    assert.ok(mapping, model);
    const task = await compileWireRequest(mapping, request, upload);
    assert.equal(task.model, expectedModel, `${model} -> ${expectedModel}`);
  }
});

test("Seedance 2.5 maps its exact request without leaking KIE envelope controls into the model", async () => {
  const request = sealSeedanceRequest("seedance-2.5", {
    prompt: ["A car crosses the desert."],
    resolution: ["720p"],
    aspectRatio: ["21:9"],
    duration: [30],
    generateAudio: [true],
    webSearch: [false],
  });
  const mapping = kieModelCatalog.find((item) => item.capability.name === "seedance-2.5");
  assert.ok(mapping);
  const task = await compileWireRequest(mapping, request, upload);
  assert.equal(task.model, "bytedance/seedance-2-5");
  assert.deepEqual(task.input, {
    prompt: "A car crosses the desert.",
    resolution: "720p",
    aspect_ratio: "21:9",
    duration: 30,
    generate_audio: true,
    web_search: false,
    return_last_frame: false,
    output_format: "mp4",
  });
});

test("one model reaching a service that splits it keeps the reference roles intact", async () => {
  const store = new MemoryArtifactStore();
  const image = await store.put(new Uint8Array([1]), "image/png");
  const audio = await store.put(new Uint8Array([3]), "audio/wav");
  const request = sealSeedanceRequest("seedance-2-mini", {
    prompt: ["A presenter speaks."],
    referenceImage: [{ role: "image", artifact: image }],
    referenceAudio: [{ role: "audio", artifact: audio }],
    resolution: ["720p"],
    aspectRatio: ["9:16"],
    duration: [5],
    generateAudio: [true],
    webSearch: [false],
  });
  const mapping = kieModelCatalog.find((item) => item.capability.name === "seedance-2-mini");
  assert.ok(mapping);
  const task = await compileWireRequest(mapping, request, upload);
  assert.deepEqual(task.input, {
    prompt: "A presenter speaks.",
    reference_image_urls: [`https://upload.test/${image.digest}`],
    reference_audio_urls: [`https://upload.test/${audio.digest}`],
    resolution: "720p",
    aspect_ratio: "9:16",
    duration: 5,
    generate_audio: true,
    web_search: false,
  });
});
