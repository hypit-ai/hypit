import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  decodeImageTransformProgramSurface,
  imageTransformComponent,
  imageTransformFragment,
  imageOperationsCapabilities,
  imageOperationsManifest,
  imageTransformTypes,
  sealImageTransformProgram,
} from "@hypit/image-operations";
import { blobTypes } from "@hypit/blob";
import type { CanonicalValue, TypedRecord } from "@hypit/protocol";

const denoiseProgram = sealImageTransformProgram({
  operations: [{
    kind: "denoise",
    method: "nlm-ycrcb",
    lumaStrength: 2,
    chromaStrength: 10,
    templateWindow: 7,
    searchWindow: 21,
    saturationRecovery: 1.02,
  }, { kind: "encode", format: "png" }],
});

test("Program sealing validates ordered generic image operations", () => {
  assert.deepEqual(denoiseProgram.operations, [{
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
      attributes: { id: "soft-denoise" },
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
  assert.deepEqual(output.records[0]?.value, (denoiseProgram as unknown as CanonicalValue));
});

test("the graph contract is exactly source plus Program to one image Need", async () => {
  assert.deepEqual(imageTransformFragment.inputs.map((input) => input.name).sort(), ["program", "source"]);
  assert.deepEqual(imageTransformFragment.exports.map((output) => output.name), ["image"]);
  assert.deepEqual(imageOperationsManifest.capabilities.map((capability) => capability.name), [
    "transform-image", "compose-image",
  ]);
  assert.deepEqual(imageOperationsManifest.producers[0]?.result.kind === "need"
    ? imageOperationsManifest.producers[0].result.capability
    : undefined,
    imageOperationsCapabilities.transform);
  const producer = imageTransformComponent.producers[0]!;
  const source = {
    kind: "blob" as const,
    resource: fixtureResource("image-source"),
    size: 123,
    mediaType: "image/png",
  };
  const record = (id: string, type: TypedRecord["type"], value: TypedRecord["value"]): TypedRecord => ({
    id,
    type,
    value,
  });
  const result = await producer.handler({
    inputs: {
      source: record("source", blobTypes.blob, source),
      program: record("program", imageTransformTypes.program,
        (denoiseProgram as unknown as CanonicalValue)),
    },
  } as never);
  assert.equal(result.kind, "need");
  assert.deepEqual(result.constraints, {
    source,
    operations: denoiseProgram.operations,
  });
});
