import assert from "node:assert/strict";
import test from "node:test";

import { sourceFrameDecodeArguments } from "../src/source-frame-decoder.js";

test("source decoder selects exact ordinal frames without time seeking or FPS resampling", () => {
  const argv = sourceFrameDecodeArguments({
    path: "source.mp4",
    window: { startFrame: 37, endFrameExclusive: 42 },
    metadata: { width: 1920, height: 1080, videoCodec: "h264" },
    platform: "linux",
  });
  assert.deepEqual(argv.slice(0, 4), ["-v", "error", "-i", "source.mp4"]);
  assert.ok(argv.includes("select=between(n\\,37\\,41)"));
  assert.equal(argv.includes("-ss"), false);
  assert.equal(argv.includes("-r"), false);
  assert.equal(argv.includes("fps="), false);
  assert.deepEqual(argv.slice(-10), [
    "passthrough", "-frames:v", "5", "-q:v", "0", "-compression_level", "1",
    "-f", "image2pipe", "-vcodec", "png", "pipe:1",
  ].slice(-10));
});
