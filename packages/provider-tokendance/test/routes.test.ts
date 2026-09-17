import assert from "node:assert/strict";
import test from "node:test";
import { assertMappingCoversPorts } from "@hypit/generation";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import { minimaxH3Ports, sealMinimaxH3Request } from "@hypit/minimax-h3";
import { seedancePorts, sealSeedanceRequest } from "@hypit/seedance";
import { seedream5LitePorts, sealSeedreamRequest } from "@hypit/seedream";

import { tokenDanceMappings } from "../src/mapping.js";
import { tokenDanceRouteForCapability } from "../src/routes.js";

const image: BlobRef = { kind: "blob", resource: "res_td_1", size: 3, mediaType: "image/png" };
const resolve = async () => "data:image/png;base64,AQID";
const SEEDANCE = { name: "@hypit/seedance", version: "1" };
const route = (module: { name: string; version: string }, name: string) => tokenDanceRouteForCapability({ module, name })!;

test("every TokenDance mapping covers its model's ports", () => {
  const tables = { ...seedancePorts, "seedream-5-lite": seedream5LitePorts, "minimax-h3": minimaxH3Ports };
  for (const mapping of tokenDanceMappings) {
    assertMappingCoversPorts(tables[mapping.capability.name as keyof typeof tables], mapping);
  }
});

test("Seedance frame requests become Ark content items with roles", async () => {
  const request = sealSeedanceRequest("seedance-2-mini", {
    prompt: ["turn"], firstFrame: [{ role: "image", artifact: image, fields: { personReference: true } }],
    resolution: ["720p"], aspectRatio: ["adaptive"], duration: [5], generateAudio: [true], webSearch: [false],
  });
  const body = await route(SEEDANCE, "seedance-2-mini").prepare(request as unknown as CanonicalValue).compile(resolve);
  assert.deepEqual(body, {
    model: "seedance-2.0-mini",
    content: [
      { type: "text", text: "turn" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AQID" }, role: "first_frame" },
    ],
    resolution: "720p", ratio: "adaptive", duration: 5, generate_audio: true,
  });
});

test("Seedream quality and ratio select the Ark pixel size", async () => {
  const request = sealSeedreamRequest({
    prompt: ["a cup"], aspectRatio: ["9:16"], quality: ["ultra"], outputFormat: ["png"], nsfwCheck: [true],
  });
  const body = await route({ name: "@hypit/seedream", version: "1" }, "seedream-5-lite").prepare(request as unknown as CanonicalValue).compile(resolve);
  assert.deepEqual(body, {
    model: "seedream-5.0-lite", prompt: "a cup", size: "3040x5504", output_format: "png", response_format: "url", watermark: false,
  });
});

test("MiniMax text-to-video without an aspect ratio is reported unsupported", () => {
  const request = sealMinimaxH3Request({ prompt: ["a kite"], duration: [5] });
  const minimax = route({ name: "@hypit/minimax-h3", version: "1" }, "minimax-h3");
  const support = minimax.supports({ capability: minimax.capability, returns: minimax.returns, constraints: request as unknown as CanonicalValue });
  assert.equal(support.status, "unsupported");
});
