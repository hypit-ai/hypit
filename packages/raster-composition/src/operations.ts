import { assertBlobRef, canonicalize } from "@hypit/hypit/value";
import {
  assertLocalSpatialDomain,
  assertSpatialMap,
  sameSpatialDomain,
} from "@hypit/spatial/algebra";
import type {
  RasterComposition,
  RasterCompositionOptions,
  RasterLayerPlacement,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertColour(value: string, label: string): void {
  assert(/^#[0-9a-f]{8}$/iu.test(value), `${label} must be #RRGGBBAA.`);
}

export function assertRasterCompositionOptions(value: RasterCompositionOptions): void {
  assert(value !== null && typeof value === "object", "RasterCompositionOptions must be an object.");
  assertLocalSpatialDomain(value.target);
  assert(Number.isSafeInteger(value.target.region.width) && Number.isSafeInteger(value.target.region.height),
    "Raster composition target extent must be whole pixels.");
  assert(value.target.region.width <= 16_384 && value.target.region.height <= 16_384,
    "Raster composition target extent exceeds 16384 pixels.");
  assertColour(value.background, "RasterCompositionOptions.background");
}

export function sealRasterCompositionOptions(value: RasterCompositionOptions): RasterCompositionOptions {
  assertRasterCompositionOptions(value);
  return canonicalize(value) as unknown as RasterCompositionOptions;
}

export function assertRasterLayerPlacement(value: RasterLayerPlacement): void {
  assert(value !== null && typeof value === "object", "RasterLayerPlacement must be an object.");
  assertSpatialMap(value.mapping);
  assert(["nearest", "linear", "cubic", "area", "lanczos"].includes(value.interpolation),
    "RasterLayerPlacement.interpolation is invalid.");
  assert(Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 1,
    "RasterLayerPlacement.opacity must lie inside [0, 1].");
}

export function sealRasterLayerPlacement(value: RasterLayerPlacement): RasterLayerPlacement {
  assertRasterLayerPlacement(value);
  return canonicalize(value) as unknown as RasterLayerPlacement;
}

export function assertRasterComposition(value: RasterComposition, requireLayer = false): void {
  assertRasterCompositionOptions(value);
  assert(Array.isArray(value.layers), "RasterComposition.layers must be an array.");
  assert(!requireLayer || value.layers.length > 0, "Raster composition requires at least one layer.");
  value.layers.forEach((layer, index) => {
    assertBlobRef(layer.source, `RasterComposition.layers.${index}.source`);
    assert(layer.source.mediaType.startsWith("image/"),
      `RasterComposition.layers.${index}.source must be image media.`);
    assertRasterLayerPlacement(layer);
    assert(sameSpatialDomain(layer.mapping.target, value.target),
      `RasterComposition.layers.${index}.mapping must target the composition domain.`);
  });
}

export function createRasterComposition(options: RasterCompositionOptions): RasterComposition {
  const sealed = sealRasterCompositionOptions(options);
  return { ...sealed, layers: [] };
}

export function appendRasterCompositionLayer(
  composition: RasterComposition,
  source: RasterComposition["layers"][number]["source"],
  placement: RasterLayerPlacement,
): RasterComposition {
  assertRasterComposition(composition);
  assertBlobRef(source, "Raster composition source");
  assert(source.mediaType.startsWith("image/"), "Raster composition source must be image media.");
  assertRasterLayerPlacement(placement);
  assert(sameSpatialDomain(placement.mapping.target, composition.target),
    "Raster layer mapping must target the composition domain.");
  const result = canonicalize({
    ...composition,
    layers: [...composition.layers, { source, ...placement }],
  }) as unknown as RasterComposition;
  assertRasterComposition(result);
  return result;
}

export function rasterCompositionRequest(value: RasterComposition): RasterComposition {
  const request = canonicalize(value) as unknown as RasterComposition;
  assertRasterComposition(request, true);
  return request;
}

export function rasterCompositionSources(value: RasterComposition) {
  assertRasterComposition(value, true);
  return value.layers.map((layer) => layer.source);
}
