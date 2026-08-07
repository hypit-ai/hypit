import { digestOf } from "@svml/core";
import type { ModuleManifest, TypeRef } from "@svml/protocol";

export const svsModuleRef = { name: "@svml/svs", version: "1" } as const;
export const svsRecipeType = { module: svsModuleRef, name: "Recipe" } satisfies TypeRef;
export const svsFrontendId = "@svml/svs@1";
export const svsFrontendImplementationDigest = digestOf("@svml/svs/frontend@1");

export const svsManifest: ModuleManifest = {
  format: "svml.module@0",
  name: svsModuleRef.name,
  version: svsModuleRef.version,
  dependencies: [],
  types: [{
    name: svsRecipeType.name,
    schema: {
      kind: "object",
      fields: {
        contract: { schema: { kind: "literal", value: "svml.svs-recipe@1" } },
        path: { schema: { kind: "string", minLength: 3 } },
        properties: {
          schema: {
            kind: "object",
            fields: {},
            allowUnknown: true,
          },
        },
      },
    },
  }],
  capabilities: [],
  surfaces: [],
  producers: [],
};
