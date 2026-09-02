import assert from "node:assert/strict";
import test from "node:test";

import { parseRunDocument } from "@hypit/run-markup";

import { pinnedRecords } from "../src/reuse-markup.js";

test("pinned Records emit Run Source markup that parses, one per output", () => {
  const pins = pinnedRecords([
    { build: "bld_newest", output: { name: "paper.image" } },
    { build: "bld_older", output: { name: "paper.image" } },
    { build: "bld_other", output: { name: "apple-plate.image" } },
  ]);
  assert.deepEqual(pins.map((item) => item.output), ["paper.image", "apple-plate.image"]);
  assert.equal(pins[0]!.build, "bld_newest", "the newest accepted Record of an output is the one selected");

  const document = [
    `<svrun version="1">`,
    `  <author source="./main.svml"/>`,
    `  <target output="final.video"/>`,
    ...pins.flatMap((item) => item.markup).map((line) => `  ${line}`),
    `</svrun>`,
  ].join("\n");
  // Emitting markup nobody can parse would be worse than emitting nothing, because it reads as done.
  const parsed = parseRunDocument("pin.svrun", document);
  assert.equal(parsed.candidates.length, 2);
  assert.equal(parsed.satisfactions.length, 2);
});
