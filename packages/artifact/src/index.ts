import type {
  ModuleManifest,
  TypeRef,
  ValueSchema,
} from "@narratage/protocol";

export const artifactModuleRef = { name: "@narratage/artifact", version: "1" } as const;

export const artifactTypes = {
  blob: { module: artifactModuleRef, name: "BlobArtifact" },
} satisfies Record<string, TypeRef>;

/** StoredValue.kind=blob already performs exact BlobRef structural validation in Protocol/Core. */
export const blobArtifactValueSchema: ValueSchema = { kind: "blob" };

export const artifactManifest: ModuleManifest = {
  format: "narratage.module@1",
  name: artifactModuleRef.name,
  version: artifactModuleRef.version,
  dependencies: [],
  types: [{ name: artifactTypes.blob.name }],
  capabilities: [],
  producers: [],
};

export const artifactDependency = {
  module: artifactModuleRef,
} as const;
