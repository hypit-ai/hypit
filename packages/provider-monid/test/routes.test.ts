import assert from "node:assert/strict";
import test from "node:test";
import { assertMappingCoversPorts } from "@hypit/generation";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import { seedancePorts, sealSeedanceRequest } from "@hypit/seedance";

import { monidMappings } from "../src/mapping.js";
import { monidRouteForCapability } from "../src/routes.js";

const image: BlobRef = { kind: "blob", resource: "res_monid_1", size: 3, mediaType: "image/png" };
const resolve = async () => "https://sfs.monid.ai/signed";

test("every Monid mapping covers its model's ports", () => {
  for (const mapping of monidMappings) {
    assertMappingCoversPorts(seedancePorts[mapping.capability.name as keyof typeof seedancePorts], mapping);
  }
});

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
