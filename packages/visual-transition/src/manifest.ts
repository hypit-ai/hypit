import type { ModuleManifest } from "@hypit/hypit/protocol";
import { visualTrackDependency } from "@hypit/visual-track";

export const visualTransitionModuleRef = { name: "@hypit/visual-transition", version: "1" } as const;

export const visualTransitionManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: visualTransitionModuleRef.name,
  version: visualTransitionModuleRef.version,
  dependencies: [visualTrackDependency],
  types: [],
  capabilities: [],
  producers: [],
};
