import { artifactDependency, artifactTypes } from "@hypit/artifact";
import type { CapabilityRef, ModuleManifest, TypeRef } from "@hypit/protocol";

export const standInModuleRef = { name: "@hypit/stand-in", version: "1" } as const;
export const standInDependency = { module: standInModuleRef } as const;

export const standInTypes = {
  cardRequest: { module: standInModuleRef, name: "StandInCardRequest" },
} satisfies Record<string, TypeRef>;

/** Draw one stand-in card. Served by a local media Provider; it draws, it never generates. */
export const standInCapabilities = {
  drawCard: { module: standInModuleRef, name: "draw-card" },
} satisfies Record<string, CapabilityRef>;

export const standInManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: standInModuleRef.name,
  version: standInModuleRef.version,
  dependencies: [artifactDependency],
  types: Object.values(standInTypes).map((item) => ({ name: item.name })),
  capabilities: Object.values(standInCapabilities).map((item) => ({ name: item.name, returns: artifactTypes.blob })),
  producers: [],
};
