import { artifactDependency, artifactTypes } from "@hypit/artifact";
import type { CapabilityRef, ModuleManifest } from "@hypit/protocol";

export const rasterModuleRef = { name: "@hypit/raster", version: "1" } as const;
export const rasterCapabilities = {
  execute: { module: rasterModuleRef, name: "execute-raster" },
} satisfies Record<string, CapabilityRef>;
export const rasterManifest: ModuleManifest = {
  format: "hypit.module@1", name: rasterModuleRef.name, version: rasterModuleRef.version,
  dependencies: [artifactDependency], types: [],
  capabilities: [{ name: rasterCapabilities.execute.name, returns: artifactTypes.blob }],
  producers: [],
};
export const rasterDependency = { module: rasterModuleRef } as const;
