import assert from "node:assert/strict";
import test from "node:test";

import { artifactTypes } from "@narratage/artifact";
import {
  createImageComposeFragment,
  decodeImageComposeSurface,
  imageComposeComponent,
  imageComposeManifest,
  imageComposeTypes,
  sealImageComposeLayerSpec,
  sealImageComposeOptions,
} from "@narratage/image-compose";
import { digestOf } from "@narratage/protocol";
import { rasterCapabilities } from "@narratage/raster";
import type { CanonicalValue, StoredValue, TypeRef, TypedRecord } from "@narratage/protocol";
import { sealCanvasSpace, sealSpatialFrame, spatialTypes } from "@narratage/spatial";

const canvas = sealCanvasSpace({
  widthPx: 1080, heightPx: 1920,
  origin: "top-left", xDirection: "right", yDirection: "down", pixelAspect: "square",
});
const frame = sealSpatialFrame({ xPx: -10, yPx: 20, widthPx: 500, heightPx: 400 });
const options = sealImageComposeOptions({ background: "#11223344" });
const spec = sealImageComposeLayerSpec({
  fit: "cover", interpolation: "lanczos", opacity: 0.75,
});
const source = { kind: "blob" as const, digest: digestOf("hero-image"), size: 123, mediaType: "image/png" };

function record(id: string, type: TypeRef, value: StoredValue): TypedRecord {
  return { id, type, value, digest: digestOf({ id, value }), origin: { kind: "authored" } };
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
  assert.equal(imageComposeManifest.capabilities.length, 0);
  assert.deepEqual(imageComposeManifest.producers.at(-1)?.needs[0]?.capability, rasterCapabilities.execute);
});

test("component data flow preserves explicit Canvas, Frame and paint order", async () => {
  const [create, append, request] = imageComposeComponent.producers;
  const empty = await create!.handler({ inputs: {} } as never);
  assert("layers" in empty.outputs);
  const appended = await append!.handler({ inputs: {
    layers: record("layers", imageComposeTypes.layerSet, empty.outputs.layers!),
    source: record("source", artifactTypes.blob, source),
    frame: record("frame", spatialTypes.frame, { kind: "inline", value: frame as unknown as CanonicalValue }),
    spec: record("spec", imageComposeTypes.layerSpec, { kind: "inline", value: spec as unknown as CanonicalValue }),
  } } as never);
  assert("layers" in appended.outputs);
  const result = await request!.handler({ inputs: {
    canvas: record("canvas", spatialTypes.canvas, { kind: "inline", value: canvas as unknown as CanonicalValue }),
    options: record("options", imageComposeTypes.options, { kind: "inline", value: options as unknown as CanonicalValue }),
    layers: record("layers", imageComposeTypes.layerSet, appended.outputs.layers!),
  } } as never);
  assert("image" in result.needs);
  assert.deepEqual(result.needs.image, { constraints: {
    contract: "svml.raster-request@1", kind: "compose", canvas, background: options.background,
    layers: [{ source, frame, fit: spec.fit, interpolation: spec.interpolation, opacity: spec.opacity }],
  } });
});

test("the Surface declares once and paints child Layers in document order", async () => {
  const references: Record<string, { type: TypeRef; record?: TypedRecord }> = {
    portrait: { type: spatialTypes.canvas }, hero: { type: artifactTypes.blob }, heroFrame: { type: spatialTypes.frame },
  };
  const output = await decodeImageComposeSurface({
    sourceName: "main.svml",
    element: {
      kind: "element", name: "compose:Image", range: { start: 0, end: 200 },
      attributes: { id: "poster", canvas: { kind: "reference", path: "portrait" }, background: "#00000000" },
      children: [{
        kind: "element", name: "compose:Layer", range: { start: 20, end: 100 }, children: [],
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
