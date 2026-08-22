import type { ModuleManifest, TypeRef } from "@hypit/protocol";
import {
  captionDocumentSchema,
  narrativeExcerptSchema,
  narrativeSchema,
  narrativeMomentSchema,
  narrativeSelectionSchema,
} from "./schema.js";

export const narrativeModuleRef = { name: "@hypit/narrative", version: "1" } as const;
export const narrativeTypes = {
  narrative: { module: narrativeModuleRef, name: "Narrative" },
  excerpt: { module: narrativeModuleRef, name: "NarrativeExcerpt" },
  selection: { module: narrativeModuleRef, name: "NarrativeSelection" },
  moment: { module: narrativeModuleRef, name: "NarrativeMoment" },
  captionDocument: { module: narrativeModuleRef, name: "CaptionDocument" },
} satisfies Record<string, TypeRef>;
export const narrativeManifest: ModuleManifest = {
  format: "hypit.module@1", name: narrativeModuleRef.name, version: narrativeModuleRef.version,
  dependencies: [],
  types: [
    { name: narrativeTypes.narrative.name },
    { name: narrativeTypes.excerpt.name },
    { name: narrativeTypes.selection.name },
    { name: narrativeTypes.moment.name },
    { name: narrativeTypes.captionDocument.name },
  ],
  capabilities: [], producers: [],
};
export const narrativeDependency = { module: narrativeModuleRef } as const;
