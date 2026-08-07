import {
  contractTypes,
  narrativeSchema,
  videoContractDependencies,
} from "@narratage/video-contracts";
import { digestOf } from "@narratage/core";
import type { ModuleManifest, TypeRef } from "@narratage/protocol";

export const scriptModuleRef = { name: "@narratage/script", version: "0.0.0-dev" } as const;
export const narrativeType: TypeRef = contractTypes.narrative;
export const narrativeExcerptType: TypeRef = contractTypes.narrativeExcerpt;
export const narrativeDialogueExcerptType: TypeRef = contractTypes.narrativeDialogueExcerpt;
export const narrativeSpeechExcerptType: TypeRef = contractTypes.narrativeSpeechExcerpt;
export const narrativeSelectionType: TypeRef = contractTypes.narrativeSelection;
export const captionProjectionType: TypeRef = contractTypes.captionProjection;
export { narrativeSchema };

export const scriptSurfaceImplementationDigest = digestOf("@narratage/script/surface@2");

export const scriptManifest: ModuleManifest = {
  format: "svml.module@1",
  name: scriptModuleRef.name,
  version: scriptModuleRef.version,
  dependencies: [videoContractDependencies.narrative],
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
