/** One point in a named local two-dimensional coordinate domain. */
export type SpatialPosition = {
  readonly x: number;
  readonly y: number;
};

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

export type ProjectiveSpatialTransform = {
  readonly kind: "projective";
  readonly xx: number;
  readonly xy: number;
  readonly tx: number;
  readonly yx: number;
  readonly yy: number;
  readonly ty: number;
  readonly wx: number;
  readonly wy: number;
  readonly ww: number;
};

export type SpatialTransform = AffineSpatialTransform | ProjectiveSpatialTransform;

/** Target/parent to source/child sampling relation. */
export type SpatialMap = {
  readonly target: LocalSpatialDomain;
  readonly source: LocalSpatialDomain;
  readonly transform: SpatialTransform;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite.`);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

export function assertSpatialPosition(value: SpatialPosition, label = "SpatialPosition"): void {
  finite(value.x, `${label}.x`);
  finite(value.y, `${label}.y`);
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

function determinant3(value: readonly number[]): number {
  return value[0]! * (value[4]! * value[8]! - value[5]! * value[7]!)
    - value[1]! * (value[3]! * value[8]! - value[5]! * value[6]!)
    + value[2]! * (value[3]! * value[7]! - value[4]! * value[6]!);
}

function matrixOf(value: SpatialTransform): readonly number[] {
  return value.kind === "affine"
    ? [value.xx, value.xy, value.tx, value.yx, value.yy, value.ty, 0, 0, 1]
    : [value.xx, value.xy, value.tx, value.yx, value.yy, value.ty, value.wx, value.wy, value.ww];
}

export function assertSpatialTransform(value: SpatialTransform, label = "SpatialTransform"): void {
  if (value.kind === "affine") {
    for (const name of ["xx", "xy", "yx", "yy", "tx", "ty"] as const) finite(value[name], `${label}.${name}`);
    assert(value.xx * value.yy - value.xy * value.yx !== 0, `${label} must be invertible.`);
    return;
  }
  assert(value.kind === "projective", `${label}.kind is invalid.`);
  for (const name of ["xx", "xy", "tx", "yx", "yy", "ty", "wx", "wy", "ww"] as const) {
    finite(value[name], `${label}.${name}`);
  }
  assert(determinant3(matrixOf(value)) !== 0, `${label} must be invertible.`);
}

export function assertSpatialMap(value: SpatialMap): void {
  assertLocalSpatialDomain(value.target);
  assertLocalSpatialDomain(value.source);
  assertSpatialTransform(value.transform, "SpatialMap.transform");
  if (value.transform.kind === "projective") {
    const { x, y, width, height } = value.target.region;
    const transform = value.transform;
    const weights = [
      transform.wx * x + transform.wy * y + transform.ww,
      transform.wx * (x + width) + transform.wy * y + transform.ww,
      transform.wx * x + transform.wy * (y + height) + transform.ww,
      transform.wx * (x + width) + transform.wy * (y + height) + transform.ww,
    ];
    assert(weights.every((entry) => entry > 0) || weights.every((entry) => entry < 0),
      "SpatialMap projective horizon crosses its finite target domain.");
  }
}

export function spatialRegionContains(region: SpatialRegion, position: SpatialPosition): boolean {
  assertSpatialRegion(region);
  assertSpatialPosition(position);
  return position.x >= region.x && position.y >= region.y
    && position.x < region.x + region.width && position.y < region.y + region.height;
}

export function transformSpatialPosition(position: SpatialPosition, transform: SpatialTransform): SpatialPosition {
  assertSpatialPosition(position);
  assertSpatialTransform(transform);
  const x = transform.xx * position.x + transform.xy * position.y + transform.tx;
  const y = transform.yx * position.x + transform.yy * position.y + transform.ty;
  if (transform.kind === "affine") return { x, y };
  const weight = transform.wx * position.x + transform.wy * position.y + transform.ww;
  assert(weight !== 0, "Projective transform maps a position onto its horizon.");
  return { x: x / weight, y: y / weight };
}

export function evaluateSpatialMap(value: SpatialMap, targetPosition: SpatialPosition): SpatialPosition | undefined {
  assertSpatialMap(value);
  if (!spatialRegionContains(value.target.region, targetPosition)) return undefined;
  const sourcePosition = transformSpatialPosition(targetPosition, value.transform);
  return spatialRegionContains(value.source.region, sourcePosition) ? sourcePosition : undefined;
}

function multiplyMatrices(left: readonly number[], right: readonly number[]): number[] {
  return Array.from({ length: 9 }, (_, index) => {
    const row = Math.floor(index / 3);
    const column = index % 3;
    return left[row * 3]! * right[column]!
      + left[row * 3 + 1]! * right[column + 3]!
      + left[row * 3 + 2]! * right[column + 6]!;
  });
}

function transformFromMatrix(value: readonly number[], affine: boolean): SpatialTransform {
  if (affine) return {
    kind: "affine",
    xx: value[0]!, xy: value[1]!, tx: value[2]!,
    yx: value[3]!, yy: value[4]!, ty: value[5]!,
  };
  return {
    kind: "projective",
    xx: value[0]!, xy: value[1]!, tx: value[2]!,
    yx: value[3]!, yy: value[4]!, ty: value[5]!,
    wx: value[6]!, wy: value[7]!, ww: value[8]!,
  };
}

/** Compose target -> intermediate and intermediate -> source sampling relations. */
export function composeSpatialMaps(first: SpatialMap, second: SpatialMap): SpatialMap {
  assertSpatialMap(first);
  assertSpatialMap(second);
  assert(sameSpatialDomain(first.source, second.target),
    `Spatial Maps cannot compose ${first.source.id} with ${second.target.id}.`);
  const affine = first.transform.kind === "affine" && second.transform.kind === "affine";
  return sealSpatialMap({
    target: first.target,
    source: second.source,
    transform: transformFromMatrix(
      multiplyMatrices(matrixOf(second.transform), matrixOf(first.transform)),
      affine,
    ),
  });
}

/** Invert one target-to-source relation, including its two finite domains. */
export function invertSpatialMap(value: SpatialMap): SpatialMap {
  assertSpatialMap(value);
  const matrix = matrixOf(value.transform);
  const determinant = determinant3(matrix);
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const inverse = [
    e! * i! - f! * h!, c! * h! - b! * i!, b! * f! - c! * e!,
    f! * g! - d! * i!, a! * i! - c! * g!, c! * d! - a! * f!,
    d! * h! - e! * g!, b! * g! - a! * h!, a! * e! - b! * d!,
  ].map((entry) => entry / determinant);
  return sealSpatialMap({
    target: value.source,
    source: value.target,
    transform: transformFromMatrix(inverse, value.transform.kind === "affine"),
  });
}

export function identitySpatialMap(domain: LocalSpatialDomain): SpatialMap {
  assertLocalSpatialDomain(domain);
  return sealSpatialMap({
    target: domain,
    source: domain,
    transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 },
  });
}

export function interpolateSpatialMaps(from: SpatialMap, to: SpatialMap, progress: number): SpatialMap {
  assertSpatialMap(from);
  assertSpatialMap(to);
  assert(from.transform.kind === "affine" && to.transform.kind === "affine",
    "Affine-linear interpolation requires affine endpoints.");
  finite(progress, "Spatial Map interpolation progress");
  assert(progress >= 0 && progress <= 1, "Spatial Map interpolation progress must lie inside [0, 1].");
  assert(sameSpatialDomain(from.target, to.target), "Spatial Map interpolation changes target domain.");
  assert(sameSpatialDomain(from.source, to.source), "Spatial Map interpolation changes source domain.");
  const coefficient = (name: Exclude<keyof AffineSpatialTransform, "kind">): number =>
    from.transform[name] + (to.transform[name] - from.transform[name]) * progress;
  return sealSpatialMap({
    target: from.target,
    source: from.source,
    transform: {
      kind: "affine",
      xx: coefficient("xx"), xy: coefficient("xy"), yx: coefficient("yx"), yy: coefficient("yy"),
      tx: coefficient("tx"), ty: coefficient("ty"),
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
