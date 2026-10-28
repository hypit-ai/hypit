import assert from "node:assert/strict";
import test from "node:test";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import { sealMinimaxH3Request } from "@hypit/minimax-h3";
import { sealSeedanceRequest } from "@hypit/seedance";
import { sealWanRequest } from "@hypit/wan";

import { monidMappings } from "../src/mapping.js";
import { monidRouteForCapability } from "../src/routes.js";

const image: BlobRef = { kind: "blob", resource: "res_monid_1", size: 3, mediaType: "image/png" };
const resolve = async () => "https://sfs.monid.ai/signed";

test("Seedance requests become the ModelArk input Monid relays", async () => {
  const route = monidRouteForCapability({ module: { name: "@hypit/seedance", version: "1" }, name: "seedance-2-mini" })!;
  const request = sealSeedanceRequest("seedance-2-mini", {
    prompt: ["turn"], referenceImage: [{ role: "image", artifact: image, fields: { personReference: true } }],
    resolution: ["720p"], aspectRatio: ["9:16"], duration: [6], generateAudio: [true], webSearch: [false],
  });
  const prepared = route.prepare(request as unknown as CanonicalValue);
  assert.equal(prepared.endpoint, "/v1/video/seedance-2.0-mini");
  assert.deepEqual(await prepared.compile(resolve), {
    content: [
      { type: "text", text: "turn" },
      { type: "image_url", image_url: { url: "https://sfs.monid.ai/signed" }, role: "reference_image" },
    ],
    resolution: "720p", ratio: "9:16", duration: 6, generate_audio: true,
  });
});

test("Monid applies its narrower Wan output quota after model validation", () => {
  const route = monidRouteForCapability({ module: { name: "@hypit/wan", version: "1" }, name: "wan-2.7-image" })!;
  const request = sealWanRequest("wan-2.7-image", { prompt: ["variations"], count: [12] });
  assert.equal(request.fields.count?.[0], 12);
  assert.deepEqual(route.supports({ capability: route.capability, returns: route.returns,
    constraints: request as unknown as CanonicalValue }), {
    status: "unsupported",
    reason: "Wan renders at most 4 pictures outside an image set, not 12",
  });
  const set = sealWanRequest("wan-2.7-image", { ...request.fields, imageSet: [true] });
  assert.equal(route.supports({ capability: route.capability, returns: route.returns,
    constraints: set as unknown as CanonicalValue }).status, "supported");
});

test("MiniMax's Model-owned resolution default reaches Monid explicitly", async () => {
  const route = monidRouteForCapability({ module: { name: "@hypit/minimax-h3", version: "1" }, name: "minimax-h3" })!;
  const request = sealMinimaxH3Request({ prompt: ["a kite"], duration: [5], aspectRatio: ["16:9"] });
  assert.deepEqual(await route.prepare(request as unknown as CanonicalValue).compile(resolve), {
    model: "MiniMax-H3",
    content: [{ type: "text", text: "a kite" }],
    resolution: "2K",
    ratio: "16:9",
    duration: 5,
    generate_audio: undefined,
  });
});
