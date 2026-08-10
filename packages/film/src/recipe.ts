import type { SvsRecipe } from "@narratage/svs";

/**
 * The Film Recipe owns Film appearance only. Canvas geometry and ProgramSpace
 * remain separate graph inputs and cannot be smuggled into a stylesheet.
 */

export type FilmAppearance = { readonly clearColor: string };

export const defaultFilmRecipe: Readonly<Record<string, string>> = {
  background: "#09090b",
};

export const filmRecipeKeys: readonly string[] = Object.keys(defaultFilmRecipe);

export function assertFilmRecipe(properties: SvsRecipe["properties"]): void {
  const actual = Object.keys(properties).sort().join(" ");
  const expected = [...filmRecipeKeys].sort().join(" ");
  if (actual !== expected) {
    throw new Error(`Film Recipe requires exactly ${[...filmRecipeKeys].sort().join(", ")}`);
  }
}

export function filmAppearanceFromRecipe(properties: SvsRecipe["properties"]): FilmAppearance {
  assertFilmRecipe(properties);
  const background = properties["background"];
  if (typeof background !== "string" || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(background)) {
    throw new Error("Film Recipe background must be a hexadecimal color");
  }
  return { clearColor: background };
}
