import type { TypeRef } from "@hypit/module";
import type { GenerationModuleDefinition } from "@hypit/generation-build";

export const blobModuleRef = { name: "@hypit/blob" } as const;

export const blobTypes = {
  blob: { module: blobModuleRef, name: "Blob" },
} satisfies Record<string, TypeRef>;

export const blobManifest: GenerationModuleDefinition = {
  name: blobModuleRef.name,
  dependencies: [],
  types: [blobTypes.blob.name],
  capabilities: [],
  producers: [],
};

export const blobDependency = blobModuleRef;
