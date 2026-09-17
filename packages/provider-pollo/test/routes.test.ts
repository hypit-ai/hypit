import assert from "node:assert/strict";
import test from "node:test";
import { assertMappingCoversPorts } from "@hypit/generation";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import { gptImage2Ports } from "@hypit/gpt-image";
import { grokImaginePorts, sealGrokImagineRequest } from "@hypit/grok-imagine";
import { minimaxH3Ports, sealMinimaxH3Request } from "@hypit/minimax-h3";
import { nanoBananaPorts } from "@hypit/nano-banana";

import { polloMappings } from "../src/mapping.js";
import { polloRouteForCapability } from "../src/routes.js";

const image: BlobRef = { kind: "blob", resource: "res_pollo_1", size: 3, mediaType: "image/png" };
const audio: BlobRef = { kind: "blob", resource: "res_pollo_2", size: 3, mediaType: "audio/wav" };
const resolve = async (artifact: { resource: string }) => `https://example.test/${artifact.resource}`;
const route = (module: string, name: string) => polloRouteForCapability({ module: { name: module, version: "1" }, name })!;
const constraints = (request: unknown) => request as CanonicalValue;

test("every Pollo mapping covers its model's ports", () => {
  const tables = { ...grokImaginePorts, ...nanoBananaPorts, "minimax-h3": minimaxH3Ports, "gpt-image-2": gptImage2Ports };
  for (const mapping of polloMappings) {
    assertMappingCoversPorts(tables[mapping.capability.name as keyof typeof tables], mapping);
  }
});

test("MiniMax H3 references become Pollo typed refs", async () => {
  const minimax = route("@hypit/minimax-h3", "minimax-h3");
  const request = sealMinimaxH3Request({
    prompt: ["walk"], duration: [6], resolution: ["2K"], aspectRatio: ["9:16"],
    referenceImage: [{ role: "image", artifact: image }], referenceAudio: [{ role: "audio", artifact: audio }],
  });
  const prepared = minimax.prepare(constraints(request));
  assert.equal(prepared.path, "/v1/generation/minimax/minimax-h3/video");
  assert.deepEqual(await prepared.compile(resolve), { input: {
    prompt: "walk", duration: 6, resolution: "2K", aspectRatio: "9:16",
    refs: [{ url: "https://example.test/res_pollo_1", type: "image" }, { url: "https://example.test/res_pollo_2", type: "audio" }],
  } });
});

test("Grok Imagine 1.5 sends its single image and takes only aspect-ratio auto", async () => {
  const grok = route("@hypit/grok-imagine", "grok-imagine-video-1.5-preview");
  const request = sealGrokImagineRequest("grok-imagine-video-1.5-preview", {
    prompt: ["spin"], aspectRatio: ["auto"], resolution: ["720p"], duration: [8], images: [{ role: "image", artifact: image }],
  });
  assert.deepEqual(await grok.prepare(constraints(request)).compile(resolve), { input: {
    prompt: "spin", resolution: "720p", duration: 8, image: "https://example.test/res_pollo_1",
  } });
  const framed = sealGrokImagineRequest("grok-imagine-video-1.5-preview", { ...request.ports, aspectRatio: ["16:9"] });
  assert.equal(grok.supports({ capability: grok.capability, returns: grok.returns, constraints: constraints(framed) }).status, "unsupported");
});
