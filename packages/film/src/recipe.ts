import type { Recipe } from "@hypit/hypit/recipe";

/**
 * The Film Recipe owns Film appearance only. Canvas geometry and Timeline
 * remain separate graph inputs and cannot be smuggled into a stylesheet.
 */

export type FilmAppearance = { readonly clearColor: string };

export function assertFilmRecipe(properties: Recipe["properties"]): void {
  const actual = Object.keys(properties).sort().join(" ");
  if (actual !== "background") {
    throw new Error("Film Recipe requires exactly background");
  }
}

export function filmAppearanceFromRecipe(properties: Recipe["properties"]): FilmAppearance {
  assertFilmRecipe(properties);
  const background = properties["background"];
  if (typeof background !== "string" || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(background)) {
    throw new Error("Film Recipe background must be a hexadecimal color");
  }
  return { clearColor: background };
}
