import { artifactDependency, artifactTypes } from "@hypit/artifact";
import type { CapabilityRef, ModuleManifest, TypeRef } from "@hypit/protocol";
import { spatialDependency, spatialTypes } from "@hypit/spatial";

export const standInModuleRef = { name: "@hypit/stand-in", version: "1" } as const;
export const standInDependency = { module: standInModuleRef } as const;

export const standInTypes = {
  cardRequest: { module: standInModuleRef, name: "StandInCardRequest" },
} satisfies Record<string, TypeRef>;

/** Draw one stand-in card. Served by a local media Provider; it draws, it never generates. */
export const standInCapabilities = {
  drawCard: { module: standInModuleRef, name: "draw-card" },
} satisfies Record<string, CapabilityRef>;

export const standInProducers = {
  card: { module: standInModuleRef, name: "stand-in-card" },
} as const;

export const standInManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: standInModuleRef.name,
  version: standInModuleRef.version,
  dependencies: [artifactDependency, spatialDependency],
  types: Object.values(standInTypes).map((item) => ({ name: item.name })),
  capabilities: Object.values(standInCapabilities).map((item) => ({ name: item.name, returns: artifactTypes.blob })),
  producers: [
    {
      name: standInProducers.card.name,
      inputs: [{ name: "canvas", type: spatialTypes.canvas }],
      outputs: [],
      needs: [{ name: "image", capability: standInCapabilities.drawCard, returns: artifactTypes.blob }],
    },
  ],
};
