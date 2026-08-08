import type { SvsRecipe } from "@narratage/svs";

import type { BrollBox, BrollItemSpec, BrollMotion } from "./types.js";

/**
 * The B-roll appearance Recipe: what a stylesheet may say about an inset.
 *
 * Held apart from the Surface handler so a stylesheet reads the same whoever is
 * reading it. Media and timing come from the graph; this is only the look.
 */

export type BrollAppearance = {
  readonly z: number;
  readonly box: BrollBox;
  readonly fit: "contain" | "cover";
  readonly backgroundColor: string;
  readonly borderRadiusPx: number;
  readonly enter: BrollMotion;
  readonly exit: BrollMotion;
};

/** One inset card. Its keys are the Recipe's required property set. */
export const defaultBrollAppearanceRecipe: Readonly<Record<string, string | number>> = {
  background: "#111116",
  enter: "slide-up 8f",
  exit: "fade 6f",
  fit: "contain",
  height: 0.48,
  radius: 28,
  "stack-order": 40,
  width: 0.84,
  x: 0.08,
  y: 0.2,
};

export const brollAppearanceRecipeKeys: readonly string[] =
  Object.keys(defaultBrollAppearanceRecipe);

function number(properties: SvsRecipe["properties"], name: string): number {
  const property = properties[name];
  if (typeof property !== "number" || !Number.isFinite(property)) {
    throw new Error(`B-roll Recipe ${name} must be a number`);
  }
  return property;
}

function string(properties: SvsRecipe["properties"], name: string): string {
  const property = properties[name];
  if (typeof property !== "string" || !property.trim()) {
    throw new Error(`B-roll Recipe ${name} must be a string`);
  }
  return property.trim();
}

/** SVS writes motion as `<operator> <frames>f`, e.g. `slide-up 8f`. */
export function brollRecipeMotion(value: string): BrollMotion {
  const found = /^(fade|pop|slide-up|slide-down)\s+([1-9][0-9]*)f$/u.exec(value.trim());
  if (found === null) throw new Error(`B-roll motion ${value} is invalid`);
  return { operator: found[1] as BrollMotion["operator"], durationFrames: Number(found[2]) };
}

export function assertBrollAppearanceRecipe(properties: SvsRecipe["properties"]): void {
  const actual = Object.keys(properties).sort().join(" ");
  const expected = [...brollAppearanceRecipeKeys].sort().join(" ");
  if (actual !== expected) {
    throw new Error(`B-roll Recipe requires exactly ${[...brollAppearanceRecipeKeys].sort().join(", ")}`);
  }
}

export function brollAppearanceFromRecipe(properties: SvsRecipe["properties"]): BrollAppearance {
  assertBrollAppearanceRecipe(properties);
  const fit = string(properties, "fit");
  if (fit !== "contain" && fit !== "cover") throw new Error("B-roll Recipe fit is invalid");
  return {
    z: number(properties, "stack-order"),
    box: {
      xPercent: number(properties, "x") * 100,
      yPercent: number(properties, "y") * 100,
      widthPercent: number(properties, "width") * 100,
      heightPercent: number(properties, "height") * 100,
    },
    fit,
    backgroundColor: string(properties, "background"),
    borderRadiusPx: number(properties, "radius"),
    enter: brollRecipeMotion(string(properties, "enter")),
    exit: brollRecipeMotion(string(properties, "exit")),
  };
}

/** The appearance a Recipe describes, as the spec an Item is built from. */
export function brollItemSpecFromRecipe(
  id: string,
  properties: SvsRecipe["properties"],
): BrollItemSpec {
  return { contract: "svml.broll-item-spec@1", id, ...brollAppearanceFromRecipe(properties) };
}
