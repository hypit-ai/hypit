import type { ModuleManifest } from "@hypit/protocol";

export * from "./location.js";
export * from "./projection.js";
export * from "./schedule.js";
export * from "./sample.js";
export type * from "./types.js";

export const temporalModuleRef = { name: "@hypit/temporal", version: "1" } as const;
export const temporalManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: temporalModuleRef.name,
  version: temporalModuleRef.version,
  dependencies: [],
  types: [],
  capabilities: [],
  producers: [],
};
export const temporalDependency = { module: temporalModuleRef } as const;
