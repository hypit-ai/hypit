import type { ModuleManifest } from "@hypit/hypit/protocol";

export const realizationModuleRef = { name: "@hypit/realization", version: "1" } as const;

export const realizationManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: realizationModuleRef.name,
  version: realizationModuleRef.version,
  dependencies: [],
  types: [],
  capabilities: [],
  producers: [],
};
