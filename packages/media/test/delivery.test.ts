import assert from "node:assert/strict";
import test from "node:test";

import {
  projectVisualDeliverySpec,
  sameVisualDeliverySpec,
  sameVisualPictureSpec,
  sealMediaDeliverySpec,
  sealVisualDeliverySpec,
  verifyVisualPictureSpec,
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
  assert.doesNotThrow(() => verifyVisualPictureSpec(image));
  assert.equal(sameVisualPictureSpec(image, { ...image }), true);
  assert.equal(sameVisualPictureSpec(image, { ...image, alpha: { mode: "opaque", matte: "#ffffff" } }), false);
  assert.throws(() => verifyVisualPictureSpec({ ...image, colorMatrix: "bt709" }), /color interpretation/u);
  assert.throws(() => verifyVisualDeliverySpec({ ...visual, picture: image }), /video interpretation/u);
});
