import assert from "node:assert/strict";
import test from "node:test";

import {
  composeSpatialMaps,
  evaluateSpatialMap,
  identitySpatialMap,
  invertSpatialMap,
  sealLocalSpatialDomain,
  sealSpatialMap,
} from "../src/algebra.js";

const space = (id: string, width: number, height: number) => sealLocalSpatialDomain({
  id,
  region: { x: 0, y: 0, width, height },
});

test("Spatial Map evaluates explicitly from parent target into child source", () => {
  const parent = space("parent:space", 1920, 1080);
  const child = space("child:space", 640, 360);
  const map = sealSpatialMap({
    target: parent,
    source: child,
    transform: { kind: "affine", xx: 2 / 3, xy: 0, yx: 0, yy: 2 / 3, tx: -320, ty: 0 },
  });
  assert.deepEqual(evaluateSpatialMap(map, { x: 480, y: 0 }), { x: 0, y: 0 });
  assert.deepEqual(evaluateSpatialMap(map, { x: 960, y: 270 }), { x: 320, y: 180 });
  assert.equal(evaluateSpatialMap(map, { x: 479, y: 0 }), undefined);
  assert.equal(evaluateSpatialMap(map, { x: 1440, y: 270 }), undefined);
});

test("Spatial Maps compose in target-to-source sampling order", () => {
  const parent = space("parent:space", 1920, 1080);
  const component = space("component:space", 960, 540);
  const texture = space("texture:space", 480, 270);
  const parentToComponent = sealSpatialMap({
    target: parent,
    source: component,
    transform: { kind: "affine", xx: 0.5, xy: 0, yx: 0, yy: 0.5, tx: 0, ty: 0 },
  });
  const componentToTexture = sealSpatialMap({
    target: component,
    source: texture,
    transform: { kind: "affine", xx: 0.5, xy: 0, yx: 0, yy: 0.5, tx: 0, ty: 0 },
  });
  const composed = composeSpatialMaps(parentToComponent, componentToTexture);
  assert.deepEqual(evaluateSpatialMap(composed, { x: 800, y: 400 }), { x: 200, y: 100 });
  assert.equal(composed.target.id, parent.id);
  assert.equal(composed.source.id, texture.id);
});

test("invert exposes author-facing placement without changing canonical Map direction", () => {
  const parent = space("parent:space", 1920, 1080);
  const child = space("child:space", 640, 360);
  const sampling = sealSpatialMap({
    target: parent,
    source: child,
    transform: { kind: "affine", xx: 0.5, xy: 0, yx: 0, yy: 0.5, tx: -160, ty: -90 },
  });
  const placement = invertSpatialMap(sampling);
  assert.deepEqual(evaluateSpatialMap(placement, { x: 160, y: 90 }), { x: 640, y: 360 });
  assert.deepEqual(composeSpatialMaps(sampling, placement).transform,
    identitySpatialMap(parent).transform);
});

test("singular affine transforms are rejected instead of inventing an inverse", () => {
  const domain = space("picture:space", 100, 100);
  assert.throws(() => sealSpatialMap({
    target: domain,
    source: domain,
    transform: { kind: "affine", xx: 1, xy: 2, yx: 2, yy: 4, tx: 0, ty: 0 },
  }), /invertible/u);
});

test("projective maps compose and invert without crossing their finite horizon", () => {
  const domain = sealLocalSpatialDomain({ id: "projective", region: { x: 0, y: 0, width: 100, height: 100 } });
  const perspective = sealSpatialMap({
    target: domain,
    source: domain,
    transform: {
      kind: "projective",
      xx: 0.8, xy: 0, tx: 10,
      yx: 0, yy: 0.8, ty: 10,
      wx: 0.001, wy: 0.001, ww: 1,
    },
  });
  const point = { x: 25, y: 40 };
  const mapped = evaluateSpatialMap(perspective, point)!;
  const restored = evaluateSpatialMap(invertSpatialMap(perspective), mapped)!;
  assert.ok(Math.abs(restored.x - point.x) < 1e-9);
  assert.ok(Math.abs(restored.y - point.y) < 1e-9);
  assert.deepEqual(composeSpatialMaps(perspective, invertSpatialMap(perspective)).transform.kind,
    "projective");

  assert.throws(() => sealSpatialMap({
    target: domain,
    source: domain,
    transform: {
      kind: "projective",
      xx: 1, xy: 0, tx: 0,
      yx: 0, yy: 1, ty: 0,
      wx: 0.02, wy: 0, ww: -1,
    },
  }), /horizon/u);
});
