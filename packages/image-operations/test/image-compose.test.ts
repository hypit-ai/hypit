import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import { blobTypes } from "@hypit/blob";
import {
  createImageComposeFragment,
  decodeImageComposeSurface,
  imageComposeComponent,
  imageOperationsCapabilities,
  imageOperationsManifest,
  imageComposeTypes,
  sealImageComposeLayerSpec,
  sealImageComposeOptions,
} from "@hypit/image-operations";
import type { CanonicalValue, Value, TypeRef, TypedRecord } from "@hypit/protocol";
import { sealCanvas, sealSpatialFrame, spatialTypes } from "@hypit/spatial";

const canvas = sealCanvas({
  widthPx: 1080, heightPx: 1920,
});
const frame = sealSpatialFrame({ xPx: -10, yPx: 20, widthPx: 500, heightPx: 400 });
const options = sealImageComposeOptions({ background: "#11223344" });
const spec = sealImageComposeLayerSpec({
  fit: "cover", interpolation: "lanczos", opacity: 0.75,
});
const source = { kind: "blob" as const, resource: fixtureResource("hero-image"), size: 123, mediaType: "image/png" };

function record(id: string, type: TypeRef, value: Value): TypedRecord {
  return { id, type, value };
}

test("Image Compose is an ordered Layer graph with no privileged base image", () => {
  const fragment = createImageComposeFragment([
    { sourceName: "a-source", frameName: "a-frame", specName: "a-spec" },
    { sourceName: "b-source", frameName: "b-frame", specName: "b-spec" },
  ]);
  assert.deepEqual(fragment.operations.map((operation) => operation.id).sort(), [
    "image:compose",
    "image:layers:append:0001", "image:layers:append:0002", "image:layers:empty",
  ].sort());
  assert.deepEqual(fragment.exports.map((output) => output.name), ["image"]);
  const result = imageOperationsManifest.producers.at(-1)?.result;
  assert.deepEqual(result?.kind === "need" ? result.capability : undefined,
    imageOperationsCapabilities.compose);
});

test("component data flow preserves explicit Canvas, Frame and paint order", async () => {
  const [create, append, request] = imageComposeComponent.producers;
  const empty = await create!.handler({ inputs: {} } as never);
  assert.equal(empty.kind, "output");
  const appended = await append!.handler({ inputs: {
    layers: record("layers", imageComposeTypes.layerSet, empty.value),
    source: record("source", blobTypes.blob, source),
    frame: record("frame", spatialTypes.frame, (frame as unknown as CanonicalValue)),
    spec: record("spec", imageComposeTypes.layerSpec, (spec as unknown as CanonicalValue)),
  } } as never);
  assert.equal(appended.kind, "output");
  const result = await request!.handler({ inputs: {
    canvas: record("canvas", spatialTypes.canvas, (canvas as unknown as CanonicalValue)),
    options: record("options", imageComposeTypes.options, (options as unknown as CanonicalValue)),
    layers: record("layers", imageComposeTypes.layerSet, appended.value),
  } } as never);
  assert.equal(result.kind, "need");
  assert.deepEqual(result.constraints, {
    canvas, background: options.background,
    layers: [{ source, frame, fit: spec.fit, interpolation: spec.interpolation, opacity: spec.opacity }],
  });
});

test("the Surface declares once and paints child Layers in document order", async () => {
  const references: Record<string, { type: TypeRef; record?: TypedRecord }> = {
    portrait: { type: spatialTypes.canvas }, hero: { type: blobTypes.blob }, heroFrame: { type: spatialTypes.frame },
  };
  const output = await decodeImageComposeSurface({
    sourceName: "main.svml",
    element: {
      kind: "element", name: "image:Compose", range: { start: 0, end: 200 },
      attributes: { id: "poster", canvas: { kind: "reference", path: "portrait" }, background: "#00000000" },
      children: [{
        kind: "element", name: "image:Layer", range: { start: 20, end: 100 }, children: [],
        attributes: {
          source: { kind: "reference", path: "hero" }, frame: { kind: "reference", path: "heroFrame" },
          fit: "cover", opacity: "0.8",
        },
      }],
    },
    resolveReference: (path) => {
      const found = references[path];
      return found === undefined ? undefined : { ...found, path, ref: { kind: "record", id: path } };
    },
    resolveAsset: async () => { throw new Error("no asset expected"); },
  });
  assert.equal(output.records.length, 2);
  assert.equal(output.components.length, 1);
  assert.deepEqual(output.components[0]?.outputs, { image: "poster.image" });
});
