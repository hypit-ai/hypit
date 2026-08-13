import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeImageTransformProgramSurface,
  gptImageDenoiseV1,
  imageTransformComponent,
  imageTransformFragment,
  imageTransformManifest,
  imageTransformTypes,
  sealImageTransformProgram,
} from "@narratage/image-transform";
import { artifactTypes } from "@narratage/artifact";
import { rasterCapabilities } from "@narratage/raster";
import { digestOf } from "@narratage/protocol";
import type { CanonicalValue, TypedRecord } from "@narratage/protocol";

test("the GPT Image cleanup is one explicit reusable Program", () => {
  assert.deepEqual(gptImageDenoiseV1.operations, [{
    kind: "denoise",
    method: "nlm-ycrcb",
    lumaStrength: 2,
    chromaStrength: 10,
    templateWindow: 7,
    searchWindow: 21,
    saturationRecovery: 1.02,
  }, { kind: "encode", format: "png" }]);
  assert.throws(() => sealImageTransformProgram({
    operations: [{ kind: "encode", format: "png" }, { kind: "blur", sigma: 1 }],
  }), /encode must be final/u);
});

test("the official Surface separates Program declaration from Transform use", async () => {
  const output = await decodeImageTransformProgramSurface({
    sourceName: "image.svml",
    element: {
      kind: "element",
      name: "image:Program",
      attributes: { id: "clean-gpt-image" },
      range: { start: 0, end: 100 },
      children: [{
        kind: "element",
        name: "image:Denoise",
        attributes: {},
        children: [],
        range: { start: 10, end: 30 },
      }, {
        kind: "element",
        name: "image:Encode",
        attributes: { format: "png" },
        children: [],
        range: { start: 31, end: 50 },
      }],
    },
    resolveReference: () => undefined,
    resolveAsset: async () => { throw new Error("no asset expected"); },
  });
  assert.equal(output.records.length, 1);
  assert.deepEqual(output.records[0]?.type, imageTransformTypes.program);
  assert.deepEqual(output.records[0]?.value, {
    kind: "inline",
    value: gptImageDenoiseV1 as unknown as CanonicalValue,
  });
});

test("the graph contract is exactly source plus Program to one image Need", async () => {
  assert.deepEqual(imageTransformFragment.inputs.map((input) => input.name).sort(), ["program", "source"]);
  assert.deepEqual(imageTransformFragment.exports.map((output) => output.name), ["image"]);
  assert.equal(imageTransformManifest.capabilities.length, 0);
  assert.deepEqual(imageTransformManifest.producers[0]?.needs[0]?.capability, rasterCapabilities.execute);
  const producer = imageTransformComponent.producers[0]!;
  const source = {
    kind: "blob" as const,
    digest: digestOf("image-source"),
    size: 123,
    mediaType: "image/png",
  };
  const record = (id: string, type: TypedRecord["type"], value: TypedRecord["value"]): TypedRecord => ({
    id,
    type,
    value,
    digest: digestOf({ id, value }),
    origin: {
      kind: "authored",
    },
  });
  const result = await producer.handler({
    inputs: {
      source: record("source", artifactTypes.blob, source),
      program: record("program", imageTransformTypes.program,
        { kind: "inline", value: gptImageDenoiseV1 as unknown as CanonicalValue }),
    },
  } as never);
  assert.deepEqual(result.outputs, {});
  assert.deepEqual(result.needs.image, {
    kind: "transform",
    source,
    operations: gptImageDenoiseV1.operations,
  });
});
