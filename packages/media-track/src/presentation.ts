import { assertSpatialPath } from "@hypit/spatial";

import type { MediaFramePresentation } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite.`);
}

export function assertMediaFramePresentation(value: MediaFramePresentation, label: string): void {
  assert(["none", "frame", "rounded", "path"].includes(value.clip.kind), `${label}.clip is invalid.`);
  if (value.clip.kind === "rounded") {
    finite(value.clip.radiusPx, `${label}.clip.radiusPx`);
    assert(value.clip.radiusPx >= 0, `${label}.clip.radiusPx is invalid.`);
  }
  if (value.clip.kind === "path") assertSpatialPath(value.clip.path);
  for (const [name, padding] of Object.entries(value.padding)) {
    finite(padding, `${label}.padding.${name}`);
    assert(padding >= 0, `${label}.padding.${name} is invalid.`);
  }
  if (value.border !== undefined) {
    finite(value.border.widthPx, `${label}.border.widthPx`);
    assert(value.border.widthPx >= 0 && ["solid", "dashed", "dotted"].includes(value.border.style)
      && value.border.color.length > 0, `${label}.border is invalid.`);
  }
  for (const [index, shadow] of value.shadows.entries()) {
    for (const [name, number] of Object.entries(shadow).filter(([, item]) => typeof item === "number")) {
      finite(number as number, `${label}.shadows.${index}.${name}`);
    }
    assert(shadow.blurPx >= 0 && shadow.color.length > 0, `${label}.shadows.${index} is invalid.`);
  }
}
