import { BT709_OPAQUE_PICTURE, BT2020_PQ10_OPAQUE_PICTURE } from "@hypit/media";
import assert from "node:assert/strict";
import test from "node:test";

import { sourceFrameDecodeArguments } from "../src/source-frame-decoder.js";

test("source decoder selects exact ordinal frames without time seeking or FPS resampling", () => {
  const argv = sourceFrameDecodeArguments({
    path: "source.mp4", picture: BT709_OPAQUE_PICTURE,
    window: { startFrame: 37, endFrameExclusive: 42 },
    metadata: { width: 1920, height: 1080, streamIndex: 2, timestamps: [0n], endTimestamp: 90_000n,
      timeBase: { numerator: 1n, denominator: 90_000n }, videoCodec: "h264" },
  });
  assert.deepEqual(argv.slice(0, 7), ["-v", "error", "-noautorotate", "-i", "source.mp4", "-map", "0:2"]);
  assert.ok(argv[argv.indexOf("-vf") + 1]!.startsWith("select=between(n\\,37\\,41)"));
  assert.equal(argv.includes("-ss"), false);
  assert.equal(argv.includes("-r"), false);
  assert.equal(argv.includes("fps="), false);
  assert.deepEqual(argv.slice(-5), ["-pix_fmt", "rgba", "-f", "rawvideo", "pipe:1"]);

});

test("HDR source decoding preserves the selected ordinal as an exact planar 10-bit sample", () => {
  const argv = sourceFrameDecodeArguments({
    path: "source.mp4", picture: BT2020_PQ10_OPAQUE_PICTURE,
    window: { startFrame: 4, endFrameExclusive: 5 },
    metadata: { width: 1920, height: 1080, streamIndex: 0, timestamps: [0n], endTimestamp: 90_000n,
      timeBase: { numerator: 1n, denominator: 90_000n }, videoCodec: "hevc" },
  }, "i420p10");
  assert.ok(argv.includes("select=between(n\\,4\\,4)"));
  assert.deepEqual(argv.slice(-5), ["1", "-pix_fmt", "yuv420p10le", "-f", "rawvideo", "pipe:1"].slice(-5));
  assert.equal(argv.includes("png"), false);
});
