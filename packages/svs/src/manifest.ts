import { digestOf } from "@narratage/core";
import type { ModuleManifest, TypeRef } from "@narratage/protocol";

export const svsModuleRef = { name: "@narratage/svs", version: "1" } as const;
export const svsRecipeType = { module: svsModuleRef, name: "Recipe" } satisfies TypeRef;
export const svsFrontendId = "@narratage/svs@1";
export const svsFrontendImplementationDigest = digestOf("@narratage/svs/frontend@1");

export const svsManifest: ModuleManifest = {
  format: "svml.module@1",
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
