import { digestOf } from "@svml/protocol";
import type { RuntimeModuleManifest } from "@svml/runtime";

export const s3ArtifactStoreModuleRef = {
  name: "@svml/artifact-store-s3",
  version: "1",
} as const;

export const s3ArtifactStoreFacet = {
  module: s3ArtifactStoreModuleRef,
  name: "artifact-store",
} as const;

export const s3ArtifactStoreImplementationDigest = digestOf(
  "@svml/artifact-store-s3/artifact-store@1",
);

export const s3ArtifactStoreRuntimeManifest: RuntimeModuleManifest = {
  format: "svml.runtime-module@1",
  name: s3ArtifactStoreModuleRef.name,
  version: s3ArtifactStoreModuleRef.version,
  facets: [{
    name: s3ArtifactStoreFacet.name,
    role: "artifact-store",
    implementation: {
      locator: "@svml/artifact-store-s3/artifact-store",
      digest: s3ArtifactStoreImplementationDigest,
    },
    permissions: ["network:aws:s3"],
  }],
};
