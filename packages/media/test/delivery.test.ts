import assert from "node:assert/strict";
import test from "node:test";

import {
  projectVisualDeliverySpec,
  sameVisualDeliverySpec,
  sameOutputPictureSpec,
  sealMediaDeliverySpec,
  sealVisualDeliverySpec,
  verifyOutputPictureSpec,
  verifyVisualDeliverySpec,
} from "../src/index.js";

const visual = {
  picture: {
    colorPrimaries: "bt709" as const,
    colorTransfer: "bt709" as const,
    colorMatrix: "bt709" as const,
    colorRange: "limited" as const,
    bitDepth: 8 as const,
    alpha: { mode: "opaque" as const, matte: "#142033" },
  },
  encoding: { codec: "h264" as const, pixelFormat: "yuv420p" as const, quality: "high" as const },
};

test("one media delivery projects the exact visual requirement consumed by a renderer", () => {
  const delivery = sealMediaDeliverySpec({
    visual,
    audio: { codec: "aac", sampleRate: 48_000, channelLayout: "stereo" },
    container: "mp4",
  });

  const projected = projectVisualDeliverySpec(delivery);
  assert.deepEqual(projected, visual);
  assert.equal(sameVisualDeliverySpec(projected, sealVisualDeliverySpec(visual)), true);
});

test("a delivery matte is an explicit opaque color rather than an encoder default", () => {
  assert.throws(() => verifyVisualDeliverySpec({
    ...visual,
    picture: { ...visual.picture, alpha: { mode: "opaque", matte: "black" } },
  }), /opaque hexadecimal color/u);
});

test("video delivery and still image pixels keep their distinct color interpretations", () => {
  const image = {
    ...visual.picture,
    colorTransfer: "srgb" as const,
    colorMatrix: "rgb" as const,
    colorRange: "full" as const,
  };
  assert.doesNotThrow(() => verifyOutputPictureSpec(image));
  assert.equal(sameOutputPictureSpec(image, { ...image }), true);
  assert.equal(sameOutputPictureSpec(image, { ...image, alpha: { mode: "opaque", matte: "#ffffff" } }), false);
  assert.throws(() => verifyOutputPictureSpec({ ...image, colorMatrix: "bt709" }), /color interpretation/u);
  assert.throws(() => verifyVisualDeliverySpec({ ...visual, picture: image }), /video interpretation/u);
});

test("PQ delivery requires explicit author-owned HDR static metadata", () => {
  const picture = { ...visual.picture, colorPrimaries: "bt2020" as const, colorTransfer: "pq" as const,
    colorMatrix: "bt2020-ncl" as const, bitDepth: 10 as const };
  const encoding = { codec: "hevc" as const, pixelFormat: "yuv420p10le" as const, quality: "high" as const };
  assert.throws(() => verifyVisualDeliverySpec({ picture, encoding }), /hdrStaticMetadata/u);
  assert.doesNotThrow(() => verifyVisualDeliverySpec({ picture, encoding, hdrStaticMetadata: {
    masteringDisplay: {
      red: { x: 0.708, y: 0.292 }, green: { x: 0.17, y: 0.797 }, blue: { x: 0.131, y: 0.046 },
      whitePoint: { x: 0.3127, y: 0.329 }, minLuminanceNits: 0.005, maxLuminanceNits: 1_000,
    },
    contentLight: { maxContentLightLevelNits: 1_000, maxFrameAverageLightLevelNits: 400 },
  } }));
});
