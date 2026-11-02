import type { IntrinsicExtent, SpatialFrame, SpatialMap2D } from './types.js';

/** Rectangle in the source plane after source-centred zoom and rotation. */
export type SourceCrop = { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly zoom: number; readonly rotation: number };

export function assertSourceCrop(crop: SourceCrop): void {
  if (!crop || ![crop.x, crop.y, crop.width, crop.height, crop.zoom, crop.rotation].every(Number.isFinite)
    || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0
    || crop.x + crop.width > 1 + 1e-9 || crop.y + crop.height > 1 + 1e-9 || crop.zoom < 1) {
    throw new Error('Visual crop requires a positive normalized source rectangle, zoom of at least one and a finite rotation.');
  }
}

/** Fit the selected source region inside the destination and retain its aspect ratio. */
export function resolveSourceCrop(crop: SourceCrop, extent: IntrinsicExtent, destination: SpatialFrame): { frame: SpatialFrame; mapping: SpatialMap2D } {
  assertSourceCrop(crop);
  const w = extent.widthPx, h = extent.heightPx;
  if (![w, h, destination.widthPx, destination.heightPx].every(value => Number.isFinite(value) && value > 0)) throw new Error('Crop source and destination require positive dimensions.');
  const scale = Math.min(destination.widthPx / (w * crop.width), destination.heightPx / (h * crop.height));
  const widthPx = w * crop.width * scale, heightPx = h * crop.height * scale;
  const frame = { xPx: destination.xPx + (destination.widthPx - widthPx) / 2, yPx: destination.yPx + (destination.heightPx - heightPx) / 2, widthPx, heightPx };
  const angle = crop.rotation * Math.PI / 180, xx = scale * crop.zoom * Math.cos(angle), yx = scale * crop.zoom * Math.sin(angle), xy = -yx, yy = xx;
  return { frame, mapping: { xx, xy, yx, yy,
    tx: frame.xPx + scale * w * (.5 - crop.x) - xx * w / 2 - xy * h / 2,
    ty: frame.yPx + scale * h * (.5 - crop.y) - yx * w / 2 - yy * h / 2,
  } };
}
