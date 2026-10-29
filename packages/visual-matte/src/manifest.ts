import { compositionDependency } from "@hypit/composition";
import type { ModuleManifest } from "@hypit/hypit/protocol";

export const visualMatteModuleRef = { name: "@hypit/visual-matte", version: "1" } as const;

export const visualMatteManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: visualMatteModuleRef.name,
  version: visualMatteModuleRef.version,
  dependencies: [compositionDependency],
  types: [],
  capabilities: [],
  producers: [],
};
