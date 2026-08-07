import { digestOf } from "@narratage/protocol";
import type {
  ModuleManifest,
  TypeRef,
  ValueSchema,
} from "@narratage/protocol";

export const artifactModuleRef = { name: "@narratage/artifact", version: "0.0.0-dev" } as const;

export const artifactTypes = {
  blob: { module: artifactModuleRef, name: "BlobArtifact" },
} satisfies Record<string, TypeRef>;

/** StoredValue.kind=blob already performs exact BlobRef structural validation in Protocol/Core. */
export const blobArtifactValueSchema: ValueSchema = { kind: "blob" };

export const artifactManifest: ModuleManifest = {
  format: "svml.module@1",
  name: artifactModuleRef.name,
  version: artifactModuleRef.version,
  dependencies: [],
  types: [{ name: artifactTypes.blob.name, schema: blobArtifactValueSchema }],
  capabilities: [],
  surfaces: [],
  producers: [],
};

export const artifactManifestDigest = digestOf(artifactManifest);
export const artifactDependency = {
  module: artifactModuleRef,
  digest: artifactManifestDigest,
} as const;
