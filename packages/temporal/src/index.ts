import { digestOf } from "@narratage/protocol";
import type { ModuleManifest } from "@narratage/protocol";

export * from "./location.js";
export * from "./projection.js";
export * from "./schedule.js";
export * from "./sample.js";
export type * from "./types.js";

export const temporalModuleRef = { name: "@narratage/temporal", version: "1" } as const;
export const temporalManifest: ModuleManifest = {
  format: "svml.module@1",
  name: temporalModuleRef.name,
  version: temporalModuleRef.version,
  dependencies: [],
  types: [],
  capabilities: [],
  surfaces: [],
  producers: [],
};
export const temporalManifestDigest = digestOf(temporalManifest);
export const temporalDependency = { module: temporalModuleRef, digest: temporalManifestDigest } as const;
