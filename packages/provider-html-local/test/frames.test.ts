import assert from "node:assert/strict";
import test from "node:test";
import { verifyHtmlFrameRequest } from "@hypit/html-program";
import { htmlFrameFixture } from "./frames-scenario.js";

test("frame selection validates original-frame bounds and exact HTML clock", () => {
  const document = htmlFrameFixture();
  verifyHtmlFrameRequest({ program: document, frames: [0, 3, 11] });
  for (const frames of [[], [12], [3, 2], [1.5]]) assert.throws(() => verifyHtmlFrameRequest({ program: document, frames }));
  assert.deepEqual({ frameRate: document.frameRate, frameCount: document.frameCount, canvas: document.canvas },
    { frameRate: document.frameRate, frameCount: 12, canvas: document.canvas });
});
