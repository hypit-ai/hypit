import type { ModuleManifest, TypeRef } from "@narratage/protocol";

export const svsModuleRef = { name: "@narratage/svs", version: "1" } as const;
export const svsRecipeType = { module: svsModuleRef, name: "Recipe" } satisfies TypeRef;
export const svsFrontendId = "@narratage/svs@1";

export const svsManifest: ModuleManifest = {
  format: "narratage.module@1",
  name: svsModuleRef.name,
  version: svsModuleRef.version,
  dependencies: [],
  types: [{
    name: svsRecipeType.name,
  }],
  capabilities: [],
  producers: [],
};
