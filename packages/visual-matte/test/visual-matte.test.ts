import assert from "node:assert/strict";
import test from "node:test";

import { HTML_VISUAL_FORMAT, type HtmlVisual } from "@hypit/html-program";

import { visualMatteEffect } from "../src/index.js";

test("Visual Matte publishes one explicit two-Picture process contract", () => {
  for (const channel of ["alpha", "luminance"] as const) for (const invert of [false, true]) {
    const effect = visualMatteEffect(channel, invert);
    assert.deepEqual(effect.inputs, ["content", "matte"]);
    assert.equal(effect.program.format, HTML_VISUAL_FORMAT);
    const visual = effect.program.payload as unknown as HtmlVisual;
    assert.equal(visual.html.match(/\{\{content\}\}/gu)?.length, 1);
    assert.equal(visual.html.match(/\{\{matte\}\}/gu)?.length, 1);
    assert.deepEqual(visual.data, { channel, invert });
    assert.match(visual.setup!, /data-hypit-matte-canvas/u);
  }
});

test("Visual Matte rejects an unknown channel instead of guessing", () => {
  assert.throws(() => visualMatteEffect("red" as "alpha"), /channel red is invalid/u);
});
