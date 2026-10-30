import assert from "node:assert/strict";
import test from "node:test";

import { sourceFrameDecodeArguments } from "../src/source-frame-decoder.js";

const sdrPicture = { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
  colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const;

test("source decoder selects exact ordinal frames without time seeking or FPS resampling", () => {
  const argv = sourceFrameDecodeArguments({
    path: "source.mp4",
    window: { startFrame: 37, endFrameExclusive: 42 },
    metadata: { width: 1920, height: 1080, streamIndex: 2, timestamps: [0n],
      timeBase: { numerator: 1n, denominator: 90_000n }, videoCodec: "h264" },
    picture: sdrPicture,
    rotation: 0,
  });
  assert.deepEqual(argv.slice(0, 7), ["-v", "error", "-noautorotate", "-i", "source.mp4", "-map", "0:2"]);
  assert.ok(argv.some(value => value.includes("select=between(n\\,37\\,41)")));
  assert.match(argv[argv.indexOf("-vf") + 1]!, /scale=in_color_matrix=bt709:in_range=tv:out_range=pc/u,
    "author picture interpretation must override container metadata");
  assert.doesNotMatch(argv[argv.indexOf("-vf") + 1]!, /trc=/u,
    "SDR source decode must not add a transfer-function conversion");
  assert.equal(argv.includes("-ss"), false);
  assert.equal(argv.includes("-r"), false);
  assert.equal(argv.includes("fps="), false);
  assert.deepEqual(argv.slice(-10), [
    "passthrough", "-frames:v", "5", "-q:v", "0", "-compression_level", "1",
    "-f", "image2pipe", "-vcodec", "png", "pipe:1",
  ].slice(-10));
});

test("PNG decode preserves straight alpha while forcing the selected image-like interpretation", () => {
  const argv = sourceFrameDecodeArguments({
    path: "source.webm",
    window: { startFrame: 0, endFrameExclusive: 1 },
    metadata: { width: 64, height: 64, streamIndex: 0, timestamps: [0n],
      timeBase: { numerator: 1n, denominator: 1_000n }, videoCodec: "vp9" },
    picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb",
      colorRange: "full", bitDepth: 8, alphaMode: "straight" },
    rotation: 90,
  });
  const filter = argv[argv.indexOf("-vf") + 1]!;
  assert.match(filter, /scale=in_range=pc:out_range=pc/u);
  assert.match(filter, /alphaextract/u);
  assert.match(filter, /alphamerge/u);
  assert.match(filter, /select=.*transpose=clock,split/u,
    "author rotation must transform pixels before alpha and color processing");
});
