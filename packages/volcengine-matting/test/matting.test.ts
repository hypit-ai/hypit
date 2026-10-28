import assert from "node:assert/strict";
import test from "node:test";
import { blobTypes } from "@hypit/blob";
import { compileMarkupDeclaration } from "../../../test/compile-markup-declaration.js";
import { portraitMattingAuthorDeclaration, volcengineMattingMarkupDeclarations } from "../src/declaration.js";
import { sealPortraitMattingRequest, volcengineMattingModuleRef } from "../src/index.js";

const source = { kind: "blob" as const, resource: "res_matting-source" as const, size: 4, mediaType: "video/mp4" };

test("portrait matting binds a source video and publishes an ordinary video edge for Prepare", async () => {
  assert.deepEqual(sealPortraitMattingRequest({ source: [{ role: "video", artifact: source }], format: ["MOV"] }).fields.format, ["MOV"]);
  assert.deepEqual(sealPortraitMattingRequest({ source: [{ role: "video", artifact: source }] }).fields.format, ["WEBM"]);
  assert.throws(() => sealPortraitMattingRequest({ source: [{ role: "image", artifact: { ...source, mediaType: "image/png" } }] }), /video|role/u);
  assert.throws(() => sealPortraitMattingRequest({ source: [{ role: "video", artifact: source }], format: ["MP4"] }), /format/u);
  const reference = { path: "performance.video", ref: { kind: "record" as const, id: "performance.video" },
    type: blobTypes.blob, record: { id: "performance.video", type: blobTypes.blob, value: source } };
  const result = await compileMarkupDeclaration({
    source: '<matte:Portrait id="cutout" source={performance.video}/>',
    module: volcengineMattingModuleRef,
    alias: "matte",
    compilers: [portraitMattingAuthorDeclaration],
    syntax: volcengineMattingMarkupDeclarations,
    references: new Map([[reference.path, reference]]),
  });
  assert.deepEqual(result.components[0]!.outputs, { video: "cutout.video" });
  assert.deepEqual(result.components[0]!.inputs["source:artifact"], { kind: "record", id: "performance.video" });
  assert.deepEqual(result.components[0]!.fragment.exports.find((item) => item.name === "video")?.type, blobTypes.blob);
});
