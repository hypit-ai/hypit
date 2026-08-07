import { narrativeDependency, narrativeSchema, narrativeTypes } from "@narratage/narrative";
import { digestOf } from "@narratage/core";
import type { ModuleManifest, TypeRef } from "@narratage/protocol";

export const scriptModuleRef = { name: "@narratage/script", version: "0.0.0-dev" } as const;
export const narrativeType: TypeRef = narrativeTypes.narrative;
export const narrativeExcerptType: TypeRef = narrativeTypes.excerpt;
export const narrativeDialogueExcerptType: TypeRef = narrativeTypes.dialogueExcerpt;
export const narrativeSpeechExcerptType: TypeRef = narrativeTypes.speechExcerpt;
export const narrativeSelectionType: TypeRef = narrativeTypes.selection;
export const narrativeMomentType: TypeRef = narrativeTypes.moment;
export const captionProjectionType: TypeRef = narrativeTypes.captionProjection;
export { narrativeSchema };

export const scriptSurfaceImplementationDigest = digestOf("@narratage/script/surface@2");

export const scriptManifest: ModuleManifest = {
  format: "svml.module@1",
  name: scriptModuleRef.name,
  version: scriptModuleRef.version,
  dependencies: [narrativeDependency],
  types: [],
  capabilities: [],
  surfaces: [
    {
      name: "script",
      tag: "script",
      mode: "raw",
      outputs: [
        narrativeType,
        narrativeExcerptType,
        narrativeDialogueExcerptType,
        narrativeSpeechExcerptType,
        narrativeSelectionType,
        narrativeMomentType,
        captionProjectionType,
      ],
      implementation: {
        kind: "trusted-frontend-surface",
        locator: "@narratage/script/surface",
        digest: scriptSurfaceImplementationDigest,
      },
    },
  ],
  producers: [],
};
