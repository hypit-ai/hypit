import type { ModuleManifest, TypeRef } from "@hypit/hypit/protocol";
export const narrativeModuleRef = { name: "@hypit/narrative", version: "1" } as const;
export const narrativeTypes = {
  narrative: { module: narrativeModuleRef, name: "Narrative" },
  segmentRef: { module: narrativeModuleRef, name: "NarrativeSegmentRef" },
  selection: { module: narrativeModuleRef, name: "NarrativeSelection" },
  moment: { module: narrativeModuleRef, name: "NarrativeMoment" },
} satisfies Record<string, TypeRef>;
export const narrativeManifest: ModuleManifest = {
  format: "hypit.module@1", name: narrativeModuleRef.name, version: narrativeModuleRef.version,
  dependencies: [],
  types: [
    narrativeTypes.narrative.name,
    narrativeTypes.segmentRef.name,
    narrativeTypes.selection.name,
    narrativeTypes.moment.name,
  ],
  capabilities: [], producers: [],
};
export const narrativeDependency = narrativeModuleRef;
