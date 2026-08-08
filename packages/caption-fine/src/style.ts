import type { CaptionStyleIntent } from "@narratage/caption";
import { sealCaptionStyle } from "@narratage/caption";
import type { SvsRecipe } from "@narratage/svs";

import type { FineCaptionParameters } from "./types.js";

export const FINE_CAPTION_FAMILY = "@narratage/caption-fine@1";

function number(value: SvsRecipe, name: string): number {
  const property = value.properties[name];
  if (typeof property !== "number" || !Number.isFinite(property)) {
    throw new Error(`Fine Caption Recipe ${name} must be a number`);
  }
  return property;
}

function integer(value: SvsRecipe, name: string): number {
  const property = number(value, name);
  if (!Number.isSafeInteger(property)) throw new Error(`Fine Caption Recipe ${name} must be an integer`);
  return property;
}

function string(value: SvsRecipe, name: string): string {
  const property = value.properties[name];
  if (typeof property !== "string" || !property.trim()) {
    throw new Error(`Fine Caption Recipe ${name} must be a string`);
  }
  return property.trim();
}

function color(value: SvsRecipe, name: string): string {
  const property = string(value, name);
  if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(property)) {
    throw new Error(`Fine Caption Recipe ${name} must be an RGB or RGBA hex color`);
  }
  return property;
}

function padding(value: string): { readonly x: number; readonly y: number } {
  const parts = value.trim().split(/\s+/u).map(Number);
  if ((parts.length !== 1 && parts.length !== 2) || parts.some((item) => !Number.isFinite(item) || item < 0)) {
    throw new Error("Fine Caption Recipe padding must contain one or two non-negative pixel numbers");
  }
  return { y: parts[0]!, x: parts[1] ?? parts[0]! };
}

export function fineCaptionParameters(recipe: SvsRecipe): FineCaptionParameters {
  const expected = [
    "align", "background", "cue-max-words", "cue-min-words", "fill", "font",
    "important-fill", "important-max-per-cue", "important-min-per-cue", "important-scale",
    "line-height", "padding", "radius", "size", "stack-order", "weight", "width", "x", "y",
  ];
  if (Object.keys(recipe.properties).sort().join("\0") !== expected.sort().join("\0")) {
    throw new Error(`Fine Caption Recipe requires exactly ${expected.join(", ")}`);
  }
  const align = string(recipe, "align");
  if (align !== "left" && align !== "center" && align !== "right") {
    throw new Error("Fine Caption Recipe align is invalid");
  }
  const pad = padding(string(recipe, "padding"));
  const parameters: FineCaptionParameters = {
    contract: "svml.caption-fine-parameters@1",
    stackingOrder: integer(recipe, "stack-order"),
    placement: { x: number(recipe, "x"), y: number(recipe, "y"), width: number(recipe, "width") },
    typography: {
      fontFamily: string(recipe, "font"),
      fontSizePx: number(recipe, "size"),
      fontWeight: integer(recipe, "weight"),
      lineHeight: number(recipe, "line-height"),
      textAlign: align,
      fill: color(recipe, "fill"),
    },
    box: {
      background: color(recipe, "background"),
      paddingXPx: pad.x,
      paddingYPx: pad.y,
      radiusPx: number(recipe, "radius"),
    },
    important: { fill: color(recipe, "important-fill"), scale: number(recipe, "important-scale") },
  };
  assertFineCaptionParameters(parameters);
  return parameters;
}

export function assertFineCaptionParameters(value: FineCaptionParameters): void {
  if (value.contract !== "svml.caption-fine-parameters@1") throw new Error("Unsupported Fine Caption parameters");
  if (!Number.isSafeInteger(value.stackingOrder) || value.stackingOrder < 0) {
    throw new Error("Fine Caption stacking order is invalid");
  }
  const numeric = [
    value.placement.x, value.placement.y, value.placement.width, value.typography.fontSizePx,
    value.typography.fontWeight, value.typography.lineHeight, value.box.paddingXPx, value.box.paddingYPx,
    value.box.radiusPx, value.important.scale,
  ];
  if (numeric.some((item) => !Number.isFinite(item) || item < 0)
    || value.placement.x > 1 || value.placement.y > 1 || value.placement.width <= 0 || value.placement.width > 1
    || value.typography.fontSizePx <= 0 || value.typography.lineHeight <= 0 || value.important.scale <= 0) {
    throw new Error("Fine Caption parameters contain invalid numeric bounds");
  }
  if (!value.typography.fontFamily.trim()) throw new Error("Fine Caption font family is empty");
  for (const colorValue of [value.typography.fill, value.box.background, value.important.fill]) {
    if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(colorValue)) throw new Error("Fine Caption color is invalid");
  }
}

export function fineCaptionStyle(id: string, recipe: SvsRecipe): CaptionStyleIntent {
  const minimumWords = integer(recipe, "cue-min-words");
  const maximumWords = integer(recipe, "cue-max-words");
  const importantMinimum = integer(recipe, "important-min-per-cue");
  const importantMaximum = integer(recipe, "important-max-per-cue");
  if (minimumWords <= 0 || maximumWords < minimumWords) {
    throw new Error("Fine Caption Recipe Cue word bounds are invalid");
  }
  if (importantMinimum < 0 || importantMaximum < importantMinimum || importantMaximum > maximumWords) {
    throw new Error("Fine Caption Recipe important bounds are invalid");
  }
  return sealCaptionStyle({
    contract: "svml.caption-style@1",
    id,
    planning: {
      cue: {
        minimumWords,
        maximumWords,
        instruction: `Split into complete semantic phrases of ${minimumWords} to ${maximumWords} display words. Never cross punctuation when avoidable.`,
      },
      fields: importantMaximum === 0 ? [] : [{
        id: "important",
        value: { kind: "boolean" },
        instruction: "Select the words whose emphasis best communicates this Cue. The words need not be contiguous.",
        minimumPerCue: importantMinimum,
        maximumPerCue: importantMaximum,
      }],
    },
    rendering: {
      family: FINE_CAPTION_FAMILY,
      parameters: fineCaptionParameters(recipe),
    },
  });
}
