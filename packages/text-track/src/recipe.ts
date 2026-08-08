import type { SvsRecipe } from "@narratage/svs";

import type { TextAppearance, TextBox } from "./types.js";

/**
 * The Text appearance Recipe: what a stylesheet may say about an overlay.
 *
 * Held apart from the Surface handler so a stylesheet reads the same whoever is
 * reading it. The handler owns element attributes and timing; this owns the
 * Recipe.
 */

export type TextItemAppearance = {
  readonly z: number;
  readonly box: TextBox;
  readonly appearance: TextAppearance;
};

/** One legible overlay. Its keys are the Recipe's required property set. */
export const defaultTextAppearanceRecipe: Readonly<Record<string, string | number>> = {
  align: "left",
  fill: "#ffffff",
  font: "Inter, system-ui, sans-serif",
  height: 0.2,
  size: 96,
  "stack-order": 90,
  tracking: -2,
  weight: 800,
  width: 0.84,
  x: 0.08,
  y: 0.12,
};

export const textAppearanceRecipeKeys: readonly string[] =
  Object.keys(defaultTextAppearanceRecipe);

function number(properties: SvsRecipe["properties"], name: string): number {
  const property = properties[name];
  if (typeof property !== "number" || !Number.isFinite(property)) {
    throw new Error(`Text Recipe ${name} must be a number`);
  }
  return property;
}

function string(properties: SvsRecipe["properties"], name: string): string {
  const property = properties[name];
  if (typeof property !== "string" || !property.trim()) {
    throw new Error(`Text Recipe ${name} must be a string`);
  }
  return property.trim();
}

export function assertTextAppearanceRecipe(properties: SvsRecipe["properties"]): void {
  const actual = Object.keys(properties).sort().join(" ");
  const expected = [...textAppearanceRecipeKeys].sort().join(" ");
  if (actual !== expected) {
    throw new Error(`Text Recipe requires exactly ${[...textAppearanceRecipeKeys].sort().join(", ")}`);
  }
}

export function textAppearanceFromRecipe(properties: SvsRecipe["properties"]): TextItemAppearance {
  assertTextAppearanceRecipe(properties);
  const align = string(properties, "align");
  if (align !== "left" && align !== "center" && align !== "right") {
    throw new Error("Text Recipe align is invalid");
  }
  return {
    z: number(properties, "stack-order"),
    box: {
      xPercent: number(properties, "x") * 100,
      yPercent: number(properties, "y") * 100,
      widthPercent: number(properties, "width") * 100,
      heightPercent: number(properties, "height") * 100,
    },
    appearance: {
      color: string(properties, "fill"),
      fontSizePx: number(properties, "size"),
      fontFamily: string(properties, "font"),
      fontWeight: number(properties, "weight"),
      letterSpacingPx: number(properties, "tracking"),
      align,
    },
  };
}
