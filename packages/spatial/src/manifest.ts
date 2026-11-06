import type { ModuleManifest, TypeRef } from "@hypit/hypit/protocol";
export const spatialModuleRef = { name: "@hypit/spatial", version: "1" } as const;
export const spatialTypes = {
  localDomain: { module: spatialModuleRef, name: "LocalSpatialDomain" },
  map: { module: spatialModuleRef, name: "SpatialMap" },
} satisfies Record<string, TypeRef>;

export const spatialManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: spatialModuleRef.name,
  version: spatialModuleRef.version,
  dependencies: [],
  types: Object.values(spatialTypes).map(type => type.name),
  capabilities: [],
  producers: [],
};
export const spatialDependency = spatialModuleRef;
