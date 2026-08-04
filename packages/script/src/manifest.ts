import {
  contractTypes,
  contractsManifestDigest,
  contractsModuleRef,
  narrativeSchema,
} from "@svml/contracts";
import { digestOf } from "@svml/core";
import type { ModuleManifest, TypeRef } from "@svml/protocol";

export const scriptModuleRef = { name: "@svml/script", version: "0.0.0-dev" } as const;
export const narrativeType: TypeRef = contractTypes.narrative;
export { narrativeSchema };

export const scriptSurfaceImplementationDigest = digestOf("@svml/script/surface@1");

export const scriptManifest: ModuleManifest = {
  format: "svml.module@0",
  name: scriptModuleRef.name,
  version: scriptModuleRef.version,
  dependencies: [{ module: contractsModuleRef, digest: contractsManifestDigest }],
  types: [],
  capabilities: [],
  surfaces: [
    {
      name: "script",
      tag: "script",
      mode: "raw",
      outputs: [narrativeType],
      implementation: {
        kind: "trusted-frontend-surface",
        locator: "@svml/script/surface",
        digest: scriptSurfaceImplementationDigest,
      },
    },
  ],
  producers: [],
};
