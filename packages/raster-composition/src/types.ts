import type { BlobRef } from "@hypit/hypit/value";
import type { LocalSpatialDomain, SpatialMap } from "@hypit/spatial/algebra";

export type RasterInterpolation = "nearest" | "linear" | "cubic" | "area" | "lanczos";

/** The finite output sampling domain and its initial colour. */
export type RasterCompositionOptions = {
  readonly target: LocalSpatialDomain;
  readonly background: string;
};

/** One source's target-to-source sampling relation and paint properties. */
export type RasterLayerPlacement = {
  readonly mapping: SpatialMap;
  readonly interpolation: RasterInterpolation;
  readonly opacity: number;
};

export type RasterCompositionLayer = RasterLayerPlacement & {
  readonly source: BlobRef;
};

/** Ordered physical raster composition. Array order is paint order. */
export type RasterComposition = RasterCompositionOptions & {
  readonly layers: readonly RasterCompositionLayer[];
};
