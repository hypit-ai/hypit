import assert from "node:assert/strict";
import test from "node:test";
import { assertMappingCoversPorts } from "@hypit/generation";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import { gptImage2Ports, sealGptImage2Request } from "@hypit/gpt-image";
import { grokImaginePorts } from "@hypit/grok-imagine";
import { minimaxH3Ports } from "@hypit/minimax-h3";
import { nanoBananaPorts } from "@hypit/nano-banana";
import { seedancePorts, sealSeedanceRequest } from "@hypit/seedance";
import { seedream5LitePorts, sealSeedreamRequest } from "@hypit/seedream";

import { hiApiMappings } from "../src/mapping.js";
import { hiApiRouteForCapability } from "../src/routes.js";

const image: BlobRef = { kind: "blob", resource: "res_hiapi_1", size: 3, mediaType: "image/png" };
const video: BlobRef = { kind: "blob", resource: "res_hiapi_2", size: 3, mediaType: "video/mp4" };
const resolve = async () => "https://example.test/reference";
const route = (module: string, name: string) => hiApiRouteForCapability({ module: { name: module, version: "1" }, name })!;
const constraints = (request: unknown) => request as CanonicalValue;

test("every HiAPI mapping covers its model's ports", () => {
  const tables = {
    ...seedancePorts, ...grokImaginePorts, ...nanoBananaPorts,
    "seedream-5-lite": seedream5LitePorts, "minimax-h3": minimaxH3Ports, "gpt-image-2": gptImage2Ports,
  };
  for (const mapping of hiApiMappings) {
    assertMappingCoversPorts(tables[mapping.capability.name as keyof typeof tables], mapping);
  }
});

test("Seedance 2.5 selects the HiAPI model from the request shape", async () => {
  const seedance = route("@hypit/seedance", "seedance-2.5");
  const base = { prompt: ["go"], resolution: ["720p"], duration: [5], generateAudio: [true], webSearch: [false] };
  const text = seedance.prepare(constraints(sealSeedanceRequest("seedance-2.5", { ...base, aspectRatio: ["16:9"] })));
  assert.equal(text.model, "seedance-2.5/text-to-video");
  const frames = seedance.prepare(constraints(sealSeedanceRequest("seedance-2.5", {
    ...base, aspectRatio: ["adaptive"], firstFrame: [{ role: "image", artifact: image, fields: { personReference: true } }],
  })));
  assert.equal(frames.model, "seedance-2.5/image-to-video");
  assert.deepEqual(await frames.compile(resolve), {
    model: "seedance-2.5/image-to-video",
    input: { prompt: "go", resolution: "720p", duration: 5, generate_audio: true, web_search: false, aspect_ratio: "adaptive", first_frame_url: "https://example.test/reference" },
  });
  const references = sealSeedanceRequest("seedance-2.5", {
    ...base, aspectRatio: ["16:9"], referenceVideo: [{ role: "video", artifact: video }],
  });
  assert.equal(seedance.prepare(constraints(references)).model, "seedance-2.5/reference-to-video");
  const framed = seedance.supports({ capability: seedance.capability, returns: seedance.returns,
    constraints: constraints(sealSeedanceRequest("seedance-2.5", { ...base, aspectRatio: ["16:9"], firstFrame: [{ role: "image", artifact: image }] })) });
  assert.equal(framed.status, "unsupported");
});

test("Seedream quality becomes the HiAPI resolution tier and 3K is unsupported", async () => {
  const seedream = route("@hypit/seedream", "seedream-5-lite");
  const request = sealSeedreamRequest({ prompt: ["a cup"], aspectRatio: ["9:16"], quality: ["ultra"], outputFormat: ["png"], nsfwCheck: [true], images: [{ role: "image", artifact: image }] });
  assert.deepEqual(await seedream.prepare(constraints(request)).compile(resolve), {
    model: "seedream-5.0-lite/image-to-image",
    input: { prompt: "a cup", aspect_ratio: "9:16", resolution: "4K", image_urls: ["https://example.test/reference"] },
  });
  const high = sealSeedreamRequest({ ...request.ports, quality: ["high"] });
  assert.equal(seedream.supports({ capability: seedream.capability, returns: seedream.returns, constraints: constraints(high) }).status, "unsupported");
});

test("GPT Image 2 background outside 1K is unsupported before references resolve", () => {
  const gpt = route("@hypit/gpt-image", "gpt-image-2");
  const request = sealGptImage2Request({ prompt: ["cut"], aspectRatio: ["1:1"], resolution: ["2K"], background: ["opaque"] });
  assert.equal(gpt.supports({ capability: gpt.capability, returns: gpt.returns, constraints: constraints(request) }).status, "unsupported");
});
