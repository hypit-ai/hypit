import { digestOf } from "@svml/protocol";
import type { RuntimeModuleManifest } from "@svml/runtime";

export const fileArtifactStoreModuleRef = {
  name: "@svml/artifact-store-fs",
  version: "1",
} as const;

export const fileArtifactStoreFacet = {
  module: fileArtifactStoreModuleRef,
  name: "artifact-store",
} as const;

export const fileArtifactStoreImplementationDigest = digestOf(
  "@svml/artifact-store-fs/artifact-store@1",
);

export const fileArtifactStoreRuntimeManifest: RuntimeModuleManifest = {
  format: "svml.runtime-module@2",
  name: fileArtifactStoreModuleRef.name,
  version: fileArtifactStoreModuleRef.version,
  facets: [
    {
      name: fileArtifactStoreFacet.name,
      role: "artifact-store",
      implementation: {
        locator: "@svml/artifact-store-fs/artifact-store",
        digest: fileArtifactStoreImplementationDigest,
      },
      permissions: ["filesystem:artifacts"],
    },
  ],
};
