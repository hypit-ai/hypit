import assert from "node:assert/strict";
import test from "node:test";

import { summarizeConstraints } from "../src/build-planning.js";

test("a request summary reads scalars off the request itself and counts references by kind", () => {
  const summary = summarizeConstraints({
    ports: {
      prompt: ["A woman writes on a whiteboard in a bright room with a pool behind the glass wall and plants."],
      duration: [10],
      resolution: ["720p"],
      generateAudio: [true],
      referenceImage: [{ artifact: { resource: "sha:1", mediaType: "image/png", size: 10 }, role: "reference" }],
      referenceAudio: [{ artifact: { resource: "sha:2", mediaType: "audio/wav", size: 10 }, role: "reference" }],
    },
  });
  assert.deepEqual(summary.fields, { prompt: "19 words", duration: 10, resolution: "720p", generateAudio: true });
  assert.deepEqual(summary.references, { image: 1, audio: 1 });
});

test("a request that is not a generation request is read from its top-level fields", () => {
  const summary = summarizeConstraints({
    audio: { resource: "sha:3", mediaType: "audio/wav", size: 320_000 },
    sampleFrames: 160_000,
    sampleRate: 16_000,
    language: "en",
  });
  assert.deepEqual(summary.fields, { sampleFrames: 160_000, sampleRate: 16_000, language: "en" });
  assert.deepEqual(summary.references, { audio: 1 });
});
