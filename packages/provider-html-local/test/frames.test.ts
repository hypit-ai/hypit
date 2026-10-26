import assert from "node:assert/strict";
import test from "node:test";
import { verifyHtmlFrameImages, verifyHtmlFrameImagesForRequest, verifyHtmlFrameRequest } from "@hypit/html-program";
import { htmlFrameFixture } from "./frames-scenario.js";
import { htmlProviderPicture } from "./provider-scenario.js";

test("frame selection validates original-frame bounds and exact HTML clock", () => {
  const document = htmlFrameFixture();
  const picture = htmlProviderPicture();
  verifyHtmlFrameRequest({ program: document, picture, frames: [0, 3, 11] });
  for (const frames of [[], [12], [3, 2], [1.5]]) assert.throws(() => verifyHtmlFrameRequest({ program: document, picture, frames }));
  assert.throws(() => verifyHtmlFrameRequest({ program: document, picture: {
    ...picture, colorTransfer: "bt709", colorMatrix: "bt709", colorRange: "limited",
  }, frames: [0] }), /sRGB full-range/u);
  assert.deepEqual({ frameRate: document.frameRate, frameCount: document.frameCount, canvas: document.canvas },
    { frameRate: document.frameRate, frameCount: 12, canvas: document.canvas });
});

test("frame image results retain their picture interpretation and absolute frame identities", () => {
  const picture = htmlProviderPicture();
  const request = { program: htmlFrameFixture(), picture, frames: [3, 11] } as const;
  const artifact = { kind: "blob", resource: "res_frame", size: 3, mediaType: "image/png" } as const;
  const result = { picture, frames: [
    { frame: 3, artifact },
    { frame: 11, artifact },
  ] };
  assert.doesNotThrow(() => verifyHtmlFrameImagesForRequest(result, request));
  assert.throws(() => verifyHtmlFrameImages({ picture, frames: [
    { frame: 11, artifact },
    { frame: 3, artifact },
  ] }), /strictly increasing/u);
  assert.throws(() => verifyHtmlFrameImagesForRequest({ ...result,
    picture: { ...picture, alpha: { mode: "opaque", matte: "#ffffff" } },
  }, request), /different picture requirement/u);
});
