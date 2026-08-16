import { narrativeDependency, narrativeSchema, narrativeTypes } from "@narratage/narrative";
import { textDependency, textTypes } from "@narratage/text";
import type { ModuleManifest, TypeRef } from "@narratage/protocol";

export const scriptModuleRef = { name: "@narratage/script", version: "1" } as const;
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
  format: "narratage.module@1",
  name: scriptModuleRef.name,
  version: scriptModuleRef.version,
  dependencies: [narrativeDependency, textDependency],
  types: [],
  capabilities: [],
  producers: [],
};
