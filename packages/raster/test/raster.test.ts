import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@narratage/protocol";
import {
  assertRasterRequest,
  rasterCapabilities,
  rasterComposeRequest,
  rasterOutputMediaType,
  rasterSources,
  rasterTransformRequest,
} from "@narratage/raster";

const image = { kind: "blob" as const, digest: digestOf("raster-image"), size: 12, mediaType: "image/png" };

test("one exact Raster capability carries both closed deterministic request variants", () => {
  const transform = rasterTransformRequest(image, [{ kind: "encode", format: "webp", quality: 90 }]);
  const compose = rasterComposeRequest({
    canvas: {
      contract: "svml.canvas-space@1", widthPx: 100, heightPx: 200,
      origin: "top-left", xDirection: "right", yDirection: "down", pixelAspect: "square",
    },
    background: "#00000000",
    layers: [{
      source: image,
      frame: { contract: "svml.spatial-frame@1", xPx: 0, yPx: 0, widthPx: 100, heightPx: 200 },
      fit: "contain", interpolation: "lanczos", opacity: 1,
    }],
  });
  assert.deepEqual(rasterCapabilities.execute.name, "execute-raster");
  assert.equal(transform.contract, compose.contract);
  assert.equal(rasterOutputMediaType(transform), "image/webp");
  assert.equal(rasterOutputMediaType(compose), "image/png");
  assert.deepEqual(rasterSources(transform), [image]);
  assert.deepEqual(rasterSources(compose), [image]);
});

test("Raster refuses unknown execution meaning rather than letting a Provider guess", () => {
  assert.throws(() => assertRasterRequest({
    contract: "svml.raster-request@1", kind: "magic", source: image,
  } as never), /kind is invalid/u);
});
