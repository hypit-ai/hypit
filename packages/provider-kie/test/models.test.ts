import assert from "node:assert/strict";
import test from "node:test";
import { MemoryResourceStore } from "@hypit/driver-node";
import type { EndpointSupport } from "@hypit/endpoint-kit";
import {
  assertMappingCoversPorts,
  compileWireRequest,
} from "@hypit/generation";
import type { GenerationPortTable } from "@hypit/generation";
import {
  gptImageDefinition,
  sealGptImage2Request,
} from "@hypit/gpt-image";
import {
  grokImagineDefinition,
  sealGrokImagineRequest,
} from "@hypit/grok-imagine";
import {
  minimaxH3Definition,
  sealMinimaxH3Request,
} from "@hypit/minimax-h3";
import {
  nanoBananaDefinition,
  sealNanoBananaRequest,
} from "@hypit/nano-banana";
import { kieModelCatalog } from "@hypit/provider-kie";
import { seedanceDefinition, sealSeedanceRequest } from "@hypit/seedance";
import {
  seedreamDefinition,
  sealSeedreamRequest,
} from "@hypit/seedream";
import type { CanonicalValue, CapabilityRef } from "@hypit/protocol";
import { kieRoutes } from "../src/routes.js";

/**
 * Every exact model this repository ships, paired with the Capability it publishes.
 * The Capability carries the module version, so a mapping written for an older model
 * version fails here rather than at submission time.
 */
const modelCapabilities: readonly { readonly ports: GenerationPortTable; readonly capability: CapabilityRef }[] = [
  seedanceDefinition, minimaxH3Definition, grokImagineDefinition,
  gptImageDefinition, nanoBananaDefinition, seedreamDefinition,
].flatMap((definition) => Object.values(definition.endpoints)
  .map((endpoint) => ({ ports: endpoint.ports, capability: endpoint.capability })));

function capabilityKey(ref: CapabilityRef): string {
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

const upload = async (artifact: { readonly resource: string }) => `https://upload.test/${artifact.resource}`;

/** Every declared model port must have an explicit KIE wire mapping. */
test("the KIE mapping covers every port every exact model declares", () => {
  assert.equal(modelCapabilities.length, kieModelCatalog.length);
  const mappings = new Map(kieModelCatalog.map((item) => [capabilityKey(item.capability), item]));
  for (const { ports, capability } of modelCapabilities) {
    // The full Capability includes the model module version.
    const mapping = mappings.get(capabilityKey(capability));
    assert.ok(mapping, `KIE declares no mapping for ${capabilityKey(capability)}`);
    assertMappingCoversPorts(ports, mapping);
  }
});

test("all eleven exact capabilities route to their documented KIE model slug", async () => {
  const store = new MemoryResourceStore();
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

test("KIE maps GPT Image background and applies its measured request combinations", async () => {
  const route = kieRoutes.find((item) => item.capability.name === "gpt-image-2");
  assert.ok(route);
  const request = sealGptImage2Request({
    prompt: ["A product cutout."],
    aspectRatio: ["1:1"],
    resolution: ["1K"],
    background: ["transparent"],
  });
  const task = await route.compile(request as unknown as CanonicalValue, upload);
  assert.deepEqual(task.input, {
    prompt: "A product cutout.",
    aspect_ratio: "1:1",
    resolution: "1K",
    background: "transparent",
  });

  for (const unsupported of [
    sealGptImage2Request({
      prompt: ["A product cutout."], aspectRatio: ["1:1"], resolution: ["2K"],
      background: ["opaque"],
    }),
    sealGptImage2Request({
      prompt: ["A portrait."], aspectRatio: ["5:4"], resolution: ["2K"],
    }),
    sealGptImage2Request({
      prompt: ["A portrait."], aspectRatio: ["3:1"], resolution: ["4K"],
    }),
  ]) {
    const support: EndpointSupport | undefined = route.supports?.({
      capability: route.capability,
      returns: route.returns,
      constraints: unsupported as unknown as CanonicalValue,
    });
    assert.equal(support?.status, "unsupported");
    assert.match(support?.status === "unsupported" ? support.reason : "", /KIE GPT Image 2/u);
  }

  for (const supported of [
    sealGptImage2Request({
      prompt: ["A portrait."], aspectRatio: ["auto"], resolution: ["4K"],
    }),
    sealGptImage2Request({
      prompt: ["A portrait."], aspectRatio: ["1:1"], resolution: ["4K"],
    }),
    sealGptImage2Request({
      prompt: ["A portrait."], aspectRatio: ["5:4"], resolution: ["4K"],
    }),
  ]) {
    assert.deepEqual(route.supports?.({
      capability: route.capability,
      returns: route.returns,
      constraints: supported as unknown as CanonicalValue,
    }), { status: "supported" });
  }
});

test("one model reaching a service that splits it keeps the reference roles intact", async () => {
  const store = new MemoryResourceStore();
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
    reference_image_urls: [`https://upload.test/${image.resource}`],
    reference_audio_urls: [`https://upload.test/${audio.resource}`],
    resolution: "720p",
    aspect_ratio: "9:16",
    duration: 5,
    generate_audio: true,
    web_search: false,
  });
});
