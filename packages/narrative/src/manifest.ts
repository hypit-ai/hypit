import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, TypeRef } from "@narratage/protocol";
import {
  captionProjectionSchema,
  narrativeDialogueExcerptSchema,
  narrativeExcerptSchema,
  narrativeSchema,
  narrativeMomentSchema,
  narrativeSelectionSchema,
  narrativeSpeechExcerptSchema,
} from "./schema.js";

export const narrativeModuleRef = { name: "@narratage/narrative", version: "0.0.0-dev" } as const;
export const narrativeTypes = {
  narrative: { module: narrativeModuleRef, name: "Narrative" },
  excerpt: { module: narrativeModuleRef, name: "NarrativeExcerpt" },
  dialogueExcerpt: { module: narrativeModuleRef, name: "NarrativeDialogueExcerpt" },
  speechExcerpt: { module: narrativeModuleRef, name: "NarrativeSpeechExcerpt" },
  selection: { module: narrativeModuleRef, name: "NarrativeSelection" },
  moment: { module: narrativeModuleRef, name: "NarrativeMoment" },
  captionProjection: { module: narrativeModuleRef, name: "CaptionProjection" },
} satisfies Record<string, TypeRef>;
export const narrativeManifest: ModuleManifest = {
  format: "svml.module@1", name: narrativeModuleRef.name, version: narrativeModuleRef.version,
  dependencies: [],
  types: [
    { name: narrativeTypes.narrative.name, schema: narrativeSchema },
    { name: narrativeTypes.excerpt.name, schema: narrativeExcerptSchema },
    { name: narrativeTypes.dialogueExcerpt.name, schema: narrativeDialogueExcerptSchema },
    { name: narrativeTypes.speechExcerpt.name, schema: narrativeSpeechExcerptSchema },
    { name: narrativeTypes.selection.name, schema: narrativeSelectionSchema },
    { name: narrativeTypes.moment.name, schema: narrativeMomentSchema },
    { name: narrativeTypes.captionProjection.name, schema: captionProjectionSchema },
  ],
  capabilities: [], surfaces: [], producers: [],
};
export const narrativeManifestDigest = digestOf(narrativeManifest);
export const narrativeDependency = { module: narrativeModuleRef, digest: narrativeManifestDigest } as const;
