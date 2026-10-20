import assert from "node:assert/strict";
import test from "node:test";

import { parseStructuredElement } from "@hypit/markup";
import type { SurfaceResolvedReference } from "@hypit/markup";
import { textTypes } from "@hypit/text";

import { decodeWanImageSurface } from "../src/surface.js";
import { wanEndpoints } from "../src/index.js";

const prompt: SurfaceResolvedReference = {
  path: "prompt",
  ref: { kind: "component-output", component: "direction", output: "text" },
  type: textTypes.text,
};

test("Wan publishes the complete generated set and an explicit primary image", async () => {
  const element = parseStructuredElement({
    name: "wan.svml",
    text: '<wan:Image id="story" prompt={prompt} count="4" image-set="true"/>',
  }, 0).element;
  const decoded = await decodeWanImageSurface({
    sourceName: "wan.svml",
    element,
    resolveReference: (path) => path === "prompt" ? prompt : undefined,
    resolveAsset: () => { throw new Error("no asset"); },
  });
  assert.deepEqual(decoded.components[0]?.outputs, {
    images: "story.images",
    image: "story.image",
  });
  assert.deepEqual(decoded.components[0]?.fragment.exports.map((item) => ({ name: item.name, type: item.type })), [
    { name: "image", type: { module: { name: "@hypit/blob", version: "1" }, name: "Blob" } },
    { name: "images", type: wanEndpoints.image!.returns },
  ]);
  assert.deepEqual(decoded.components[0]?.fragment.operations.map((item) => item.id), [
    "bind-text:0001:prompt",
    "finalize-request",
    "generate",
    "select-primary-image",
  ]);
});
