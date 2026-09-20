import assert from "node:assert/strict";
import test from "node:test";
import { assertMappingCoversPorts } from "@hypit/generation";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import { gptImage2Ports } from "@hypit/gpt-image";
import { grokImaginePorts } from "@hypit/grok-imagine";
import { minimaxH3Ports, sealMinimaxH3Request } from "@hypit/minimax-h3";
import { nanoBananaPorts } from "@hypit/nano-banana";
import { seedancePorts, sealSeedanceRequest } from "@hypit/seedance";

import { beatApiMappings } from "../src/mapping.js";
import { beatApiRouteForCapability } from "../src/routes.js";

const image: BlobRef = { kind: "blob", resource: "res_beatapi_1", size: 3, mediaType: "image/png" };
const resolve = async (artifact: { resource: string }) => `https://media.beatapi.io/inputs/${artifact.resource}.png`;
const route = (module: string, name: string) => beatApiRouteForCapability({ module: { name: module, version: "1" }, name })!;
const constraints = (request: unknown) => request as CanonicalValue;

test("every BeatAPI mapping covers its model's ports", () => {
  const tables = {
    ...seedancePorts, ...grokImaginePorts, ...nanoBananaPorts,
    "minimax-h3": minimaxH3Ports, "gpt-image-2": gptImage2Ports,
  };
  for (const mapping of beatApiMappings) {
    assertMappingCoversPorts(tables[mapping.capability.name as keyof typeof tables], mapping);
  }
});

test("frames travel as one ordered images array", async () => {
  const minimax = route("@hypit/minimax-h3", "minimax-h3");
  const request = sealMinimaxH3Request({
    prompt: ["Move smoothly from the opening portrait to the final product reveal."],
    duration: [5], resolution: ["768P"],
    firstFrame: [{ role: "image", artifact: image }],
    lastFrame: [{ role: "image", artifact: { ...image, resource: "res_beatapi_2" } }],
  });
  assert.deepEqual(await minimax.prepare(constraints(request)).compile(resolve), {
    model: "minimax-h3",
    prompt: "Move smoothly from the opening portrait to the final product reveal.",
    duration: 5,
    resolution: "768P",
    images: ["https://media.beatapi.io/inputs/res_beatapi_1.png", "https://media.beatapi.io/inputs/res_beatapi_2.png"],
  });
});

test("Seedance ports BeatAPI has no field for are dropped when off and refused when on", async () => {
  const mini = route("@hypit/seedance", "seedance-2-mini");
  const ports = {
    prompt: ["A handheld tracking shot through a crowded neon night market."],
    duration: [5], resolution: ["720p"], aspectRatio: ["adaptive"],
    generateAudio: [false], webSearch: [false],
  };
  assert.deepEqual(await mini.prepare(constraints(sealSeedanceRequest("seedance-2-mini", ports))).compile(resolve), {
    model: "seedance-2-mini",
    prompt: "A handheld tracking shot through a crowded neon night market.",
    duration: 5,
    resolution: "720p",
    aspect_ratio: "adaptive",
  });

  for (const stated of [{ generateAudio: [true] }, { webSearch: [true] }]) {
    const request = sealSeedanceRequest("seedance-2-mini", { ...ports, ...stated });
    assert.equal(mini.supports({ capability: mini.capability, returns: mini.returns, constraints: constraints(request) }).status,
      "unsupported");
  }
});
