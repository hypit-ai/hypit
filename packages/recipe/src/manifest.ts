import type { ModuleManifest, TypeRef } from "@hypit/protocol";

export const recipeModuleRef = { name: "@hypit/recipe", version: "1" } as const;
export const recipeType = { module: recipeModuleRef, name: "Recipe" } satisfies TypeRef;
export const recipeFrontendId = "@hypit/recipe@1";

export const recipeManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: recipeModuleRef.name,
  version: recipeModuleRef.version,
  dependencies: [],
  types: [recipeType.name],
  capabilities: [],
  producers: [],
};
