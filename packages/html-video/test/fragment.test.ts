import assert from "node:assert/strict";
import test from "node:test";

import { audioProgramTypes } from "@hypit/audio-program";
import { htmlProgramProducers, htmlProgramTypes } from "@hypit/html-program";
import { mediaTypes } from "@hypit/media";

import { createHtmlVideoFragment } from "../src/fragment.js";

test("video assembly consumes picture and audio terminal programmes", () => {
  const fragment = createHtmlVideoFragment();
  assert.deepEqual(fragment.inputs, [
    { name: "audio", type: audioProgramTypes.program },
    { name: "delivery", type: mediaTypes.delivery },
    { name: "program", type: htmlProgramTypes.program },
  ]);
  const visual = fragment.operations.find((operation) =>
    operation.producer.name === htmlProgramProducers.requestVisual.name);
  assert.deepEqual(visual?.inputs.program, { kind: "fragment-input", name: "program" });
});

test("range assembly keeps request selection separate from programme facts", () => {
  const fragment = createHtmlVideoFragment(true);
  assert.deepEqual(fragment.inputs.map((input) => input.name), [
    "audio", "audio-range", "delivery", "program", "visual-range",
  ]);
  assert.equal(fragment.operations.some((operation) =>
    operation.producer.name === htmlProgramProducers.requestVisualRange.name), true);
});
