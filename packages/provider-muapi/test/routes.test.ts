import assert from "node:assert/strict";
import test from "node:test";
import { assertMappingCoversPorts } from "@hypit/generation";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import { sealSeedanceRequest, seedancePorts } from "@hypit/seedance";

import { muApiMappings } from "../src/mapping.js";
import { muApiRouteForCapability } from "../src/routes.js";

const image: BlobRef = { kind: "blob", resource: "res_muapi_1", size: 3, mediaType: "image/png" };
const resolve = async () => "https://example.test/reference";
const route = muApiRouteForCapability({ module: { name: "@hypit/seedance", version: "1" }, name: "seedance-2.5" })!;
const constraints = (request: unknown) => request as CanonicalValue;

test("every MuAPI mapping covers the exact Seedance ports", () => {
  assert.equal(muApiMappings.length, 1);
  assertMappingCoversPorts(seedancePorts["seedance-2.5"], muApiMappings[0]!);
});

test("Seedance text requests compile to MuAPI's native model path body", async () => {
  const request = sealSeedanceRequest("seedance-2.5", {
    prompt: ["a lighthouse in rain"],
    resolution: ["720p"],
    aspectRatio: ["16:9"],
    duration: [5],
    generateAudio: [false],
    webSearch: [false],
  });
  const prepared = route.prepare(constraints(request));
  assert.equal(prepared.model, "seedance-2.5-text-to-video");
  assert.deepEqual(await prepared.compile(resolve), {
    prompt: "a lighthouse in rain",
    resolution: "720p",
    aspect_ratio: "16:9",
    duration: 5,
  });
});

test("a first frame selects MuAPI's image-to-video endpoint and uploads one URL field", async () => {
  const request = sealSeedanceRequest("seedance-2.5", {
    prompt: ["animate the light"],
    resolution: ["720p"],
    aspectRatio: ["9:16"],
    duration: [6],
    generateAudio: [false],
    webSearch: [false],
    firstFrame: [{ role: "image", artifact: image, fields: { personReference: false } }],
  });
  const prepared = route.prepare(constraints(request));
  assert.equal(prepared.model, "seedance-2.5-image-to-video");
  assert.deepEqual(await prepared.compile(resolve), {
    prompt: "animate the light",
    resolution: "720p",
    aspect_ratio: "9:16",
    duration: 6,
    image_url: "https://example.test/reference",
  });
});

test("unsupported Seedance controls are rejected before reference resolution", () => {
  const reference = sealSeedanceRequest("seedance-2.5", {
    prompt: ["keep the subject"], resolution: ["720p"], aspectRatio: ["16:9"], duration: [5],
    generateAudio: [false], webSearch: [false],
    referenceImage: [{ role: "image", artifact: image, fields: { personReference: false } }],
  });
  const supported = route.supports({ capability: route.capability, returns: route.returns, constraints: constraints(reference) });
  assert.equal(supported.status, "unsupported");
  if (supported.status === "unsupported") assert.match(supported.reason, /omni references/u);

  const audio = sealSeedanceRequest("seedance-2.5", {
    prompt: ["audio"], resolution: ["720p"], aspectRatio: ["16:9"], duration: [5],
    generateAudio: [true], webSearch: [false],
  });
  const audioSupport = route.supports({ capability: route.capability, returns: route.returns, constraints: constraints(audio) });
  assert.equal(audioSupport.status, "unsupported");
});
