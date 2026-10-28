import type { ModuleManifest } from "@hypit/hypit/protocol";
import { visualAdjustmentDependency } from "@hypit/visual-adjustment";

export const visualTreatmentModuleRef = { name: "@hypit/visual-treatment", version: "1" } as const;

export const visualTreatmentManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: visualTreatmentModuleRef.name,
  version: visualTreatmentModuleRef.version,
  dependencies: [visualAdjustmentDependency],
  types: [],
  capabilities: [],
  producers: [],
};
