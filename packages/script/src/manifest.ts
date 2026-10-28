import type { ModuleManifest, TypeRef } from "@hypit/hypit/protocol";
import { captionDependency, captionTypes } from "@hypit/caption";
import { narrativeDependency, narrativeSchema, narrativeTypes } from "@hypit/narrative";
import { narrativeCaptionDependency, narrativeCaptionTypes } from "@hypit/narrative-caption";
import { textDependency, textTypes } from "@hypit/hypit/text";

export const scriptModuleRef = { name: "@hypit/script", version: "1" } as const;
export const narrativeType: TypeRef = narrativeTypes.narrative;
export const narrativeSegmentRefType: TypeRef = narrativeTypes.segmentRef;
export const narrativeSelectionType: TypeRef = narrativeTypes.selection;
export const narrativeMomentType: TypeRef = narrativeTypes.moment;
export const captionDocumentType: TypeRef = captionTypes.document;
export const narrativeCaptionBindingType: TypeRef = narrativeCaptionTypes.binding;
export { narrativeSchema };

export const scriptManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: scriptModuleRef.name,
  version: scriptModuleRef.version,
  dependencies: [captionDependency, narrativeDependency, narrativeCaptionDependency, textDependency],
  types: [],
  capabilities: [],
  producers: [],
};
