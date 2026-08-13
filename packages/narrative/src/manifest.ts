import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, TypeRef } from "@narratage/protocol";
import {
  captionCorrespondenceSchema,
  captionDisplaySequenceSchema,
  captionDisplayWordSubsetSchema,
  narrativeExcerptSchema,
  narrativeSchema,
  narrativeMomentSchema,
  narrativeSelectionSchema,
} from "./schema.js";

export const narrativeModuleRef = { name: "@narratage/narrative", version: "1" } as const;
export const narrativeTypes = {
  narrative: { module: narrativeModuleRef, name: "Narrative" },
  excerpt: { module: narrativeModuleRef, name: "NarrativeExcerpt" },
  selection: { module: narrativeModuleRef, name: "NarrativeSelection" },
  moment: { module: narrativeModuleRef, name: "NarrativeMoment" },
  captionDisplay: { module: narrativeModuleRef, name: "CaptionDisplaySequence" },
  captionCorrespondence: { module: narrativeModuleRef, name: "CaptionCorrespondence" },
  captionDisplayWordSubset: { module: narrativeModuleRef, name: "CaptionDisplayWordSubset" },
} satisfies Record<string, TypeRef>;
export const narrativeManifest: ModuleManifest = {
  format: "svml.module@1", name: narrativeModuleRef.name, version: narrativeModuleRef.version,
  dependencies: [],
  types: [
    { name: narrativeTypes.narrative.name, schema: narrativeSchema },
    { name: narrativeTypes.excerpt.name, schema: narrativeExcerptSchema },
    { name: narrativeTypes.selection.name, schema: narrativeSelectionSchema },
    { name: narrativeTypes.moment.name, schema: narrativeMomentSchema },
    { name: narrativeTypes.captionDisplay.name, schema: captionDisplaySequenceSchema },
    { name: narrativeTypes.captionCorrespondence.name, schema: captionCorrespondenceSchema },
    { name: narrativeTypes.captionDisplayWordSubset.name, schema: captionDisplayWordSubsetSchema },
  ],
  capabilities: [], producers: [],
};
export const narrativeManifestDigest = digestOf(narrativeManifest);
export const narrativeDependency = { module: narrativeModuleRef, digest: narrativeManifestDigest } as const;
