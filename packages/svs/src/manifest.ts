import type { ModuleManifest, TypeRef } from "@hypit/protocol";

export const svsModuleRef = { name: "@hypit/svs", version: "1" } as const;
export const svsRecipeType = { module: svsModuleRef, name: "Recipe" } satisfies TypeRef;
export const svsFrontendId = "@hypit/svs@1";

export const svsManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: svsModuleRef.name,
  version: svsModuleRef.version,
  dependencies: [],
  types: [{
    name: svsRecipeType.name,
  }],
  capabilities: [],
  producers: [],
};
