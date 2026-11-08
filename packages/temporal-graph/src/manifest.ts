import type { ModuleManifest, TypeRef } from "@hypit/protocol";

export const temporalGraphModuleRef = { name: "@hypit/temporal-graph", version: "1" } as const;

export const temporalTypes = {
  duration: { module: temporalGraphModuleRef, name: "TemporalDuration" },
  exactValue: { module: temporalGraphModuleRef, name: "ExactTemporalValue" },
  extent: { module: temporalGraphModuleRef, name: "TemporalExtent" },
  frameSpan: { module: temporalGraphModuleRef, name: "FrameSpan" },
  samplingGrid: { module: temporalGraphModuleRef, name: "TemporalSamplingGrid" },
  map: { module: temporalGraphModuleRef, name: "TemporalMap" },
  mapPoint: { module: temporalGraphModuleRef, name: "TemporalMapPoint" },
  mapRegion: { module: temporalGraphModuleRef, name: "TemporalMapRegion" },
  mapPreimage: { module: temporalGraphModuleRef, name: "TemporalMapPreimage" },
  regionSet: { module: temporalGraphModuleRef, name: "TemporalMapRegionSet" },
  localDomain: { module: temporalGraphModuleRef, name: "LocalTemporalDomain" },
} satisfies Record<string, TypeRef>;

export const temporalManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: temporalGraphModuleRef.name,
  version: temporalGraphModuleRef.version,
  dependencies: [],
  types: Object.values(temporalTypes).map((type) => type.name),
  capabilities: [],
  producers: [],
};

export const temporalDependency = temporalGraphModuleRef;
