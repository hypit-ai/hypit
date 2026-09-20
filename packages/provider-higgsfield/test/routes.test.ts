import assert from "node:assert/strict";
import test from "node:test";
import { assertMappingCoversPorts } from "@hypit/generation";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import { seedancePorts, sealSeedanceRequest } from "@hypit/seedance";

import { higgsfieldMappings } from "../src/mapping.js";
import { higgsfieldRouteForCapability } from "../src/routes.js";

const image: BlobRef = { kind: "blob", resource: "res_higgsfield_1", size: 3, mediaType: "image/png" };
const video: BlobRef = { kind: "blob", resource: "res_higgsfield_2", size: 3, mediaType: "video/mp4" };
const resolve = async () => "https://cdn.higgsfield.test/reference.png";
const route = (name: string) => higgsfieldRouteForCapability({ module: { name: "@hypit/seedance", version: "1" }, name })!;
const constraints = (request: unknown) => request as CanonicalValue;
const base = { prompt: ["go"], resolution: ["720p"], duration: [5], generateAudio: [true], webSearch: [false] };
const supports = (name: string, ports: Record<string, readonly unknown[]>) => {
  const seedance = route(name);
  return seedance.supports({
    capability: seedance.capability, returns: seedance.returns,
    constraints: constraints(sealSeedanceRequest(name as "seedance-2" | "seedance-2.5", ports as never)),
  });
};

test("every Higgsfield mapping covers its model's ports", () => {
  for (const mapping of higgsfieldMappings) {
    assertMappingCoversPorts(seedancePorts[mapping.capability.name as "seedance-2" | "seedance-2.5"], mapping);
  }
});

test("the workflow endpoint follows the authored request shape", async () => {
  const seedance = route("seedance-2.5");
  assert.equal(
    seedance.prepare(constraints(sealSeedanceRequest("seedance-2.5", { ...base, aspectRatio: ["16:9"] }))).endpoint,
    "bytedance/seedance-2.5/text-to-video",
  );
  const frames = seedance.prepare(constraints(sealSeedanceRequest("seedance-2.5", {
    ...base, aspectRatio: ["adaptive"], firstFrame: [{ role: "image", artifact: image, fields: { personReference: true } }],
  })));
  assert.equal(frames.endpoint, "bytedance/seedance-2.5/image-to-video");
  // Image to video frames from the supplied image, so the workflow declares no aspect_ratio field,
  // and Higgsfield documents no web search field for any Seedance workflow.
  assert.deepEqual(await frames.compile(resolve), {
    prompt: "go", resolution: "720p", duration: 5, generate_audio: true,
    image_url: "https://cdn.higgsfield.test/reference.png",
  });
  const references = seedance.prepare(constraints(sealSeedanceRequest("seedance-2.5", {
    ...base, aspectRatio: ["9:16"], referenceVideo: [{ role: "video", artifact: video, fields: { personReference: false } }],
  })));
  assert.equal(references.endpoint, "bytedance/seedance-2.5/reference-to-video");
  assert.deepEqual(await references.compile(resolve), {
    prompt: "go", resolution: "720p", duration: 5, generate_audio: true, aspect_ratio: "9:16",
    video_urls: ["https://cdn.higgsfield.test/reference.png"],
  });
});

test("Higgsfield's narrower range is reported before submission", () => {
  // Seedance 2.5 renders 480p or 720p here; Seedance 2.0 keeps the model's wider band.
  assert.equal(supports("seedance-2.5", { ...base, resolution: ["1080p"], aspectRatio: ["16:9"] }).status, "unsupported");
  assert.equal(supports("seedance-2", { ...base, resolution: ["1080p"], aspectRatio: ["16:9"] }).status, "supported");
  assert.equal(supports("seedance-2.5", { ...base, webSearch: [true], aspectRatio: ["16:9"] }).status, "unsupported");
  assert.equal(supports("seedance-2.5", { ...base, duration: [-1], aspectRatio: ["16:9"] }).status, "unsupported");
  // An explicit ratio with image to video, or adaptive without it, would change the author's request.
  assert.equal(supports("seedance-2.5", {
    ...base, aspectRatio: ["16:9"], firstFrame: [{ role: "image", artifact: image, fields: { personReference: true } }],
  }).status, "unsupported");
  assert.equal(supports("seedance-2.5", { ...base, aspectRatio: ["adaptive"] }).status, "unsupported");
});
