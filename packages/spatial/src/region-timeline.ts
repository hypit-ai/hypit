import type { CanonicalValue } from "@hypit/protocol";
import type { SvsRecipe } from "@hypit/svs";

import { assertCanvasSpace, sealSpatialRegionTimeline } from "./geometry.js";
import type { CanvasSpace, SpatialFrame, SpatialRegionTimeline } from "./types.js";

type CanonicalRecord = Readonly<Record<string, CanonicalValue>>;

function record(value: CanonicalValue, label: string): CanonicalRecord {
  if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error(`${label} must be a record.`);
  return value as CanonicalRecord;
}

function exact(value: CanonicalRecord, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).find((name) => !allowed.includes(name));
  if (unknown !== undefined) throw new Error(`${label} does not accept ${unknown}.`);
}

function positiveInteger(value: CanonicalValue | undefined, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function normalizedRegion(value: CanonicalValue, canvas: CanvasSpace, label: string): SpatialFrame | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length !== 4 || value.some((part) => typeof part !== "number" || !Number.isFinite(part))) {
    throw new Error(`${label} must be null or [x, y, width, height].`);
  }
  const [x, y, width, height] = value as unknown as readonly [number, number, number, number];
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
    throw new Error(`${label} must be a positive normalized region inside the Canvas.`);
  }
  return {
    xPx: x * canvas.widthPx,
    yPx: y * canvas.heightPx,
    widthPx: width * canvas.widthPx,
    heightPx: height * canvas.heightPx,
  };
}

/** Resolve normalized author data into frame-exact Canvas-pixel evidence. */
export function spatialRegionTimeline(recipe: SvsRecipe, canvas: CanvasSpace): SpatialRegionTimeline {
  assertCanvasSpace(canvas);
  exact(recipe.properties, ["frame-count", "tracks"], `Spatial Region Timeline ${recipe.path}`);
  const frameCount = positiveInteger(recipe.properties["frame-count"], `${recipe.path}.frame-count`);
  const tracksValue = recipe.properties.tracks;
  if (!Array.isArray(tracksValue) || tracksValue.length === 0) throw new Error(`${recipe.path}.tracks must be a non-empty list.`);
  const tracks = tracksValue.map((value, trackIndex) => {
    const item = record(value, `${recipe.path}.tracks.${trackIndex + 1}`);
    exact(item, ["id", "regions"], `${recipe.path}.tracks.${trackIndex + 1}`);
    const id = item.id;
    if (typeof id !== "string" || !id.trim()) throw new Error(`${recipe.path}.tracks.${trackIndex + 1}.id must be non-empty text.`);
    const regions = item.regions;
    if (!Array.isArray(regions) || regions.length !== frameCount) {
      throw new Error(`${recipe.path}.tracks.${trackIndex + 1}.regions must contain exactly ${frameCount} Frames.`);
    }
    return {
      id,
      frames: regions.map((region, frame) => normalizedRegion(
        region,
        canvas,
        `${recipe.path}.${id}.regions.${frame}`,
      )),
    };
  });
  return sealSpatialRegionTimeline({ canvas, frameCount, tracks });
}
