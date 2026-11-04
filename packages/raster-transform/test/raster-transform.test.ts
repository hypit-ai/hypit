import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { rasterTransformComponent, rasterTransformProducers, rasterTransformTypes, sealImageTransformProgram } from "@hypit/raster-transform";
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

test("the Producer carries source and Program into one image Need", async () => {
  const producer = rasterTransformComponent.producers.find((item) =>
    item.producer.name === rasterTransformProducers.request.name);
  assert.ok(producer);
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
      program: record("program", rasterTransformTypes.program,
        (denoiseProgram as unknown as CanonicalValue)),
    },
  } as never);
  assert.equal(result.kind, "need");
  assert.deepEqual(result.constraints, {
    source,
    operations: denoiseProgram.operations,
  });
});
