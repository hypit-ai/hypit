import { artifactDependency, artifactTypes } from "@narratage/artifact";
import { digestOf } from "@narratage/protocol";
import type { CapabilityRef, ModuleManifest } from "@narratage/protocol";

export const rasterModuleRef = { name: "@narratage/raster", version: "1" } as const;
export const rasterCapabilities = {
  execute: { module: rasterModuleRef, name: "execute-raster" },
} satisfies Record<string, CapabilityRef>;
export const rasterManifest: ModuleManifest = {
  format: "svml.module@1", name: rasterModuleRef.name, version: rasterModuleRef.version,
  dependencies: [artifactDependency], types: [],
  capabilities: [{ name: rasterCapabilities.execute.name, returns: artifactTypes.blob }],
  producers: [], surfaces: [],
};
export const rasterManifestDigest = digestOf(rasterManifest);
export const rasterDependency = { module: rasterModuleRef, digest: rasterManifestDigest } as const;
