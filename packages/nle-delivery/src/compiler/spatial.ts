import { assertIdentity } from "@hypit/nle";

/** Finite axis-aligned support of one local coordinate domain. */
export type SpatialRegion = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** A unit-neutral local coordinate system owned by the Programme or Source. */
export type LocalSpatialDomain = {
  readonly id: string;
  readonly region: SpatialRegion;
};

export type AffineSpatialTransform = {
  readonly kind: "affine";
  readonly xx: number;
  readonly xy: number;
  readonly yx: number;
  readonly yy: number;
  readonly tx: number;
  readonly ty: number;
};

/** Target/parent to source/child sampling relation. */
export type SpatialMap = {
  readonly target: LocalSpatialDomain;
  readonly source: LocalSpatialDomain;
  readonly transform: AffineSpatialTransform;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite.`);
}

export function assertSpatialRegion(value: SpatialRegion, label = "SpatialRegion"): void {
  finite(value.x, `${label}.x`);
  finite(value.y, `${label}.y`);
  finite(value.width, `${label}.width`);
  finite(value.height, `${label}.height`);
  assert(value.width > 0 && value.height > 0, `${label} must have positive extent.`);
}

export function assertLocalSpatialDomain(value: LocalSpatialDomain): void {
  assertIdentity(value.id, "LocalSpatialDomain.id");
  assertSpatialRegion(value.region, `LocalSpatialDomain ${value.id} region`);
}

export function sameSpatialDomain(left: LocalSpatialDomain, right: LocalSpatialDomain): boolean {
  return left.id === right.id
    && left.region.x === right.region.x
    && left.region.y === right.region.y
    && left.region.width === right.region.width
    && left.region.height === right.region.height;
}

export function assertSpatialMap(value: SpatialMap): void {
  assertLocalSpatialDomain(value.target);
  assertLocalSpatialDomain(value.source);
  const transform = value.transform;
  for (const name of ["xx", "xy", "yx", "yy", "tx", "ty"] as const) {
    finite(transform[name], `SpatialMap.transform.${name}`);
  }
  assert(transform.xx * transform.yy - transform.xy * transform.yx !== 0,
    "SpatialMap.transform must be invertible.");
}

/** Invert one target-to-source relation. */
export function invertSpatialMap(value: SpatialMap): SpatialMap {
  const { xx, xy, yx, yy, tx, ty } = value.transform;
  const determinant = xx * yy - xy * yx;
  return sealSpatialMap({
    target: value.source,
    source: value.target,
    transform: {
      kind: "affine",
      xx: yy / determinant,
      xy: -xy / determinant,
      yx: -yx / determinant,
      yy: xx / determinant,
      tx: (xy * ty - tx * yy) / determinant,
      ty: (tx * yx - xx * ty) / determinant,
    },
  });
}

export function sealLocalSpatialDomain(value: LocalSpatialDomain): LocalSpatialDomain {
  assertLocalSpatialDomain(value);
  return structuredClone(value);
}

export function sealSpatialMap(value: SpatialMap): SpatialMap {
  assertSpatialMap(value);
  return structuredClone(value);
}
