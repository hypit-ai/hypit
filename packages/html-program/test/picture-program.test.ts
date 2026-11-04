import assert from "node:assert/strict";
import test from "node:test";

import { assertHtmlProgram, compileHtmlPictureProgram } from "../src/index.js";

test("one stable Picture tree compiles directly into the single HtmlProgram contract", () => {
  const program = compileHtmlPictureProgram({
    id: "picture-terminal",
    frameRate: { numerator: 30, denominator: 1 },
    frameCount: 2,
    canvas: { width: 64, height: 36, clearColor: "#000000" },
    root: {
      id: "root",
      kind: "box",
      spans: [{ startFrame: 0, endFrameExclusive: 2 }],
      style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
      children: [],
    },
  });

  assert.deepEqual(Object.keys(program).sort(), [
    "artifacts", "canvas", "frameCount", "frameRate", "html", "videoSources",
  ]);
  assertHtmlProgram(program);
  assert.equal([...program.html.matchAll(/data-hypit-element-id="root"/gu)].length, 1);
});
