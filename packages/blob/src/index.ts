import type {
  ModuleManifest,
  TypeRef,
} from "@hypit/protocol";

export const blobModuleRef = { name: "@hypit/blob", version: "1" } as const;

export const blobTypes = {
  blob: { module: blobModuleRef, name: "Blob" },
} satisfies Record<string, TypeRef>;

export const blobManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: blobModuleRef.name,
  version: blobModuleRef.version,
  dependencies: [],
  types: [blobTypes.blob.name],
  capabilities: [],
  producers: [],
};

export const blobDependency = blobModuleRef;
