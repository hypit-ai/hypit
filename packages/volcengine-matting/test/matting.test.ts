import assert from "node:assert/strict";
import test from "node:test";
import { artifactTypes } from "@hypit/artifact";
import { parseStructuredElement } from "@hypit/markup";
import { sealPortraitMattingRequest } from "../src/index.js";
import { decodePortraitMattingSurface } from "../src/surface.js";

const source = { kind: "blob" as const, resource: "res_matting-source" as const, size: 4, mediaType: "video/mp4" };

test("portrait matting binds a source video and publishes an ordinary video edge for Normalize", async () => {
  assert.deepEqual(sealPortraitMattingRequest({ source: [{ role: "video", artifact: source }], format: ["MOV"] }).ports.format, ["MOV"]);
  assert.throws(() => sealPortraitMattingRequest({ source: [{ role: "image", artifact: { ...source, mediaType: "image/png" } }] }), /video|role/u);
  assert.throws(() => sealPortraitMattingRequest({ source: [{ role: "video", artifact: source }], format: ["MP4"] }), /format/u);
  const result = await decodePortraitMattingSurface({
    sourceName: "matting.svml",
    element: parseStructuredElement({ name: "matting.svml", text: '<matte:Portrait id="cutout" source={performance.video}/>' }, 0).element,
    resolveReference: () => ({ path: "performance.video", ref: { kind: "record", id: "performance.video" },
      type: artifactTypes.blob, record: { id: "performance.video", type: artifactTypes.blob, value: source } }),
    resolveAsset: () => { throw new Error("No file literal in this Source"); },
  });
  assert.deepEqual(result.components[0]!.outputs, { video: "cutout.video" });
  assert.deepEqual(result.components[0]!.inputs["source:artifact"], { kind: "record", id: "performance.video" });
  assert.deepEqual(result.fragments[0]!.exports.find((item) => item.name === "video")?.type, artifactTypes.blob);
});
