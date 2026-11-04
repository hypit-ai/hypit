import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import {
  appendRasterCompositionLayer,
  createRasterComposition,
  rasterCompositionRequest,
} from "@hypit/raster-composition";
import { sealLocalSpatialDomain, sealSpatialMap } from "@hypit/spatial/algebra";

const target = sealLocalSpatialDomain({ id: "output", region: { x: 0, y: 0, width: 1080, height: 1920 } });
const sourceDomain = sealLocalSpatialDomain({ id: "hero", region: { x: 0, y: 0, width: 540, height: 960 } });
const source = {
  kind: "blob" as const,
  resource: fixtureResource("raster-composition-source"),
  size: 123,
  mediaType: "image/png",
};

test("composition accumulates upstream images while placement remains SpatialMap", () => {
  const empty = createRasterComposition({ target, background: "#00000000" });
  const mapping = sealSpatialMap({
    target,
    source: sourceDomain,
    transform: { kind: "affine", xx: 0.5, xy: 0, yx: 0, yy: 0.5, tx: 0, ty: 0 },
  });
  const composition = appendRasterCompositionLayer(empty, source, {
    mapping,
    interpolation: "lanczos",
    opacity: 0.75,
  });
  assert.deepEqual(rasterCompositionRequest(composition).layers, [{
    source,
    mapping,
    interpolation: "lanczos",
    opacity: 0.75,
  }]);
});

test("composition refuses mappings into a different target domain", () => {
  const empty = createRasterComposition({ target, background: "#00000000" });
  const other = sealLocalSpatialDomain({ id: "other", region: target.region });
  assert.throws(() => appendRasterCompositionLayer(empty, source, {
    mapping: sealSpatialMap({
      target: other,
      source: sourceDomain,
      transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 },
    }),
    interpolation: "linear",
    opacity: 1,
  }), /target the composition domain/u);
});
