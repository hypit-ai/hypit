import type { NleCanvas, NlePictureCrop, NlePictureLayout } from "./types.js";

export type NlePictureExtent = {
  readonly width: number;
  readonly height: number;
};

export type NlePictureRect = NlePictureExtent & {
  readonly x: number;
  readonly y: number;
};

function assertExtent(value: NlePictureExtent, label: string): void {
  if (!Number.isFinite(value.width) || value.width <= 0
    || !Number.isFinite(value.height) || value.height <= 0) {
    throw new Error(`${label} must have a finite positive extent.`);
  }
}

/** Resolve the Source rectangle in one authored Item frame. */
export function fitNlePictureContent(
  layout: NlePictureLayout,
  source: NlePictureExtent,
): NlePictureRect {
  assertExtent(layout, "NLE Picture frame");
  assertExtent(source, "NLE Picture source");
  let width = layout.width;
  let height = layout.height;
  if (layout.fit !== "fill") {
    const scale = layout.fit === "contain"
      ? Math.min(layout.width / source.width, layout.height / source.height)
      : Math.max(layout.width / source.width, layout.height / source.height);
    width = source.width * scale;
    height = source.height * scale;
  }
  return {
    x: layout.x + (layout.width - width) * (layout.contentX ?? 0.5),
    y: layout.y + (layout.height - height) * (layout.contentY ?? 0.5),
    width,
    height,
  };
}

/** Resolve an authored crop in the original source coordinate system. */
export function cropNlePictureSource(source: NlePictureRect, crop?: NlePictureCrop): NlePictureRect {
  const { left = 0, top = 0, right = 0, bottom = 0 } = crop ?? {};
  if (left === 0 && top === 0 && right === 0 && bottom === 0) return source;
  const x = source.x + left * source.width;
  const y = source.y + top * source.height;
  return {
    x, y,
    width: (1 - right) * source.width - (x - source.x),
    height: (1 - bottom) * source.height - (y - source.y),
  };
}

/** Create a centred frame preserving the selected Source aspect inside the Composition canvas. */
export function centeredNlePictureLayout(
  canvas: NleCanvas,
  source: NlePictureExtent,
  crop?: NlePictureCrop,
): NlePictureLayout {
  const content = fitNlePictureContent({
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
    fit: "contain",
  }, cropNlePictureSource({ x: 0, y: 0, width: source.width, height: source.height }, crop));
  return { ...content, fit: "fill" };
}
