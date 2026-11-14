import type { TypeRef } from "@hypit/module";
import type { GenerationModuleDefinition } from "@hypit/generation-build";

export const recipeModuleRef = { name: "@hypit/recipe" } as const;
export const recipeType = { module: recipeModuleRef, name: "Recipe" } satisfies TypeRef;
export const recipeFrontendId = "@hypit/recipe";

export const recipeManifest: GenerationModuleDefinition = {
  name: recipeModuleRef.name,
  dependencies: [],
  types: [recipeType.name],
  capabilities: [],
  producers: [],
};
