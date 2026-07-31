import assert from "node:assert/strict";
import test from "node:test";
import { emitHyperframesHtml, frameSeconds } from "../src/hyperframes.js";

test("frame lowering preserves half-open intervals for repeating seconds", () => {
  assert.equal(frameSeconds(977, 30), "32.566666666");
  assert.equal(frameSeconds(32, 30), "1.066666666");

  const html = emitHyperframesHtml({
    id: "floating-boundary",
    width: 1080,
    height: 1920,
    fps: 30,
    durationFrames: 1083,
    background: "#000",
    visuals: [{
      id: "instagram-post",
      kind: "image",
      source: "./post.png",
      startFrame: 977,
      endFrameExclusive: 1009,
      z: 1,
    }],
    audios: [],
  });

  assert.match(html, /data-start="32\.566666666"/u);
  assert.match(html, /data-duration="1\.066666666"/u);
});
