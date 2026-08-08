import type { SvsRecipe } from "@narratage/svs";

import type { FilmProgram } from "./types.js";

/**
 * The Film Recipe: what a stylesheet says about the frame itself.
 *
 * Not an appearance among others — a Film Recipe is where a canvas comes from,
 * so anything that has to choose a frame size before compiling reads it here.
 */

export type FilmCanvas = {
  readonly frameRate: FilmProgram["frameRate"];
  readonly canvas: FilmProgram["canvas"];
};

/** One vertical frame at 30. Its keys are the Recipe's required property set. */
export const defaultFilmRecipe: Readonly<Record<string, string | number>> = {
  background: "#09090b",
  "frame-rate": 30,
  height: 1920,
  width: 1080,
};

export const filmRecipeKeys: readonly string[] = Object.keys(defaultFilmRecipe);

function number(properties: SvsRecipe["properties"], name: string): number {
  const property = properties[name];
  if (typeof property !== "number" || !Number.isFinite(property)) {
    throw new Error(`Film Recipe ${name} must be a number`);
  }
  return property;
}

export function assertFilmRecipe(properties: SvsRecipe["properties"]): void {
  const actual = Object.keys(properties).sort().join(" ");
  const expected = [...filmRecipeKeys].sort().join(" ");
  if (actual !== expected) {
    throw new Error(`Film Recipe requires exactly ${[...filmRecipeKeys].sort().join(", ")}`);
  }
}

export function filmCanvasFromRecipe(properties: SvsRecipe["properties"]): FilmCanvas {
  assertFilmRecipe(properties);
  const background = properties["background"];
  if (typeof background !== "string" || !background.trim()) {
    throw new Error("Film Recipe background must be a string");
  }
  return {
    frameRate: { numerator: number(properties, "frame-rate"), denominator: 1 },
    canvas: {
      width: number(properties, "width"),
      height: number(properties, "height"),
      clearColor: background.trim(),
    },
  };
}
