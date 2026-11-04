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

/**
 * One local two-dimensional coordinate domain.
 * Coordinates are deliberately unit-neutral; a package owns their meaning.
 */
export type LocalSpatialDomain = {
  readonly id: string;
  readonly region: SpatialRegion;
};

/**
 * Affine point transform:
 *
 * x' = xx * x + xy * y + tx
 * y' = yx * x + yy * y + ty
 */
export type AffineSpatialTransform = {
  readonly kind: "affine";
  readonly xx: number;
  readonly xy: number;
  readonly yx: number;
  readonly yy: number;
  readonly tx: number;
  readonly ty: number;
};

/**
 * Invertible projective transform in homogeneous coordinates:
 *
 * X = xx * x + xy * y + tx
 * Y = yx * x + yy * y + ty
 * W = wx * x + wy * y + ww
 * x' = X / W, y' = Y / W
 */
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

/**
 * Renderer-facing sampling relation from a target/parent domain into a
 * source/child domain. Positions outside either finite support do not sample.
 */
export type SpatialMap = {
  readonly target: LocalSpatialDomain;
  readonly source: LocalSpatialDomain;
  readonly transform: SpatialTransform;
};
