import assert from "node:assert/strict";
import test from "node:test";

import { summarizeConstraints, unreportedFailures } from "../src/build-planning.js";

test("a generic request summary reads only declared top-level fields and counts references by kind", () => {
  const summary = summarizeConstraints({
    prompt: "A woman writes on a whiteboard in a bright room with a pool behind the glass wall and plants.",
    duration: 10,
    resolution: "720p",
    generateAudio: true,
    referenceImage: { resource: "resource:1", mediaType: "image/png", size: 10 },
    referenceAudio: { resource: "resource:2", mediaType: "audio/wav", size: 10 },
  });
  assert.deepEqual(summary.fields, { prompt: "19 words", duration: 10, resolution: "720p", generateAudio: true });
  assert.deepEqual(summary.references, { image: 1, audio: 1 });
});

test("a request that is not a generation request is read from its top-level fields", () => {
  const summary = summarizeConstraints({
    audio: { resource: "resource:3", mediaType: "audio/wav", size: 320_000 },
    sampleFrames: 160_000,
    sampleRate: 16_000,
    language: "en",
  });
  assert.deepEqual(summary.fields, { sampleFrames: 160_000, sampleRate: 16_000, language: "en" });
  assert.deepEqual(summary.references, { audio: 1 });
});

test("a Chinese request reports characters instead of pretending the whole prompt is one word", () => {
  const summary = summarizeConstraints({ prompt: "一个女生在大学教室里拿着手麦说话".repeat(3) });
  assert.deepEqual(summary.fields, { prompt: "48 chars" });
});

test("a Producer failure is kept only when no planned need already reports it", () => {
  const failures = new Map([
    ["assemble-timeline", "Timeline duration 8s must land on an exact frame boundary."],
    ["final:request-visual-render", "the Endpoint refused this range"],
  ]);

  assert.deepEqual(unreportedFailures(new Set(["final:request-visual-render"]), failures), [
    { step: "assemble-timeline", message: "Timeline duration 8s must land on an exact frame boundary." },
  ]);
  assert.deepEqual(unreportedFailures(new Set(), failures).map((item) => item.step),
    ["assemble-timeline", "final:request-visual-render"]);
  assert.deepEqual(unreportedFailures(new Set(failures.keys()), failures), []);
});
