import type { FontStackRef } from "@hypit/media";
import type { SvsRecipe } from "@hypit/svs";

/** The two values a Style decoder receives after author references are resolved. */
export type ExampleStyleInput = {
  readonly recipe: { readonly path: string; readonly properties: SvsRecipe["properties"] };
  readonly fonts: FontStackRef;
};

/** A deliberately small, runnable Style boundary for the fixture. */
export function decodeExampleStyle(input: ExampleStyleInput): { readonly recipe: ExampleStyleInput["recipe"]; readonly fonts: FontStackRef } {
  return { recipe: { path: input.recipe.path, properties: { ...input.recipe.properties } }, fonts: input.fonts };
}
