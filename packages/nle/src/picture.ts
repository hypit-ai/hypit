import type { NleCanvas, NlePictureLayout } from "./types.js";

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

/**
 * Resolve the visible Source rectangle inside one authored Item frame.
 *
 * The returned rectangle uses the same coordinates as `layout`: `contain` may leave
 * unused frame space, `cover` may extend beyond the frame, and `fill` coincides with it.
 */
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

/** Create a centred Item frame that preserves the Source aspect inside the Project canvas. */
export function containNlePictureLayout(
  canvas: Pick<NleCanvas, "width" | "height">,
  source: NlePictureExtent,
): NlePictureLayout {
  const content = fitNlePictureContent({
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
    fit: "contain",
  }, source);
  return { ...content, fit: "contain" };
}
