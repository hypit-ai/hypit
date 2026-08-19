import { narrativeDependency, narrativeSchema, narrativeTypes } from "@hypit/narrative";
import { textDependency, textTypes } from "@hypit/text";
import type { ModuleManifest, TypeRef } from "@hypit/protocol";

export const scriptModuleRef = { name: "@hypit/script", version: "1" } as const;
export const narrativeType: TypeRef = narrativeTypes.narrative;
export const narrativeExcerptType: TypeRef = narrativeTypes.excerpt;
export const narrativeSelectionType: TypeRef = narrativeTypes.selection;
export const narrativeMomentType: TypeRef = narrativeTypes.moment;
export const captionDisplayType: TypeRef = narrativeTypes.captionDisplay;
export const captionCorrespondenceType: TypeRef = narrativeTypes.captionCorrespondence;
export const captionDisplayWordSubsetType: TypeRef = narrativeTypes.captionDisplayWordSubset;
export { narrativeSchema };

export const scriptMarkupSurfaces = [
  {
    name: "script",
    tag: "script",
    mode: "raw",
    outputs: [
      narrativeType,
      narrativeExcerptType,
      textTypes.text,
      narrativeSelectionType,
      narrativeMomentType,
      captionDisplayType,
      captionCorrespondenceType,
      captionDisplayWordSubsetType,
    ],
  },
] as const;

export const scriptManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: scriptModuleRef.name,
  version: scriptModuleRef.version,
  dependencies: [narrativeDependency, textDependency],
  types: [],
  capabilities: [],
  producers: [],
};
