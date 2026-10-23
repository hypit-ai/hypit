import { mediaDependency, timelineDependency } from "./schema.js";
import type { ModuleManifest, TypeRef } from "@hypit/hypit/protocol";
import { audioTrackSchema, compositionSchema, visualScopeSchema, visualTrackSchema } from "./schema.js";
export const compositionModuleRef = { name: "@hypit/composition", version: "1" } as const;
export const compositionTypes = { visualTrack: { module: compositionModuleRef, name: "VisualTrack" }, audioTrack: { module: compositionModuleRef, name: "AudioTrack" }, visualScope: { module: compositionModuleRef, name: "VisualScope" }, composition: { module: compositionModuleRef, name: "Composition" } } satisfies Record<string, TypeRef>;
export const compositionManifest: ModuleManifest = { format: "hypit.module@1", name: compositionModuleRef.name, version: compositionModuleRef.version,
  dependencies: [mediaDependency, timelineDependency], types: [
    compositionTypes.visualTrack.name,
    compositionTypes.audioTrack.name,
    compositionTypes.visualScope.name,
    compositionTypes.composition.name,
  ], capabilities: [], producers: [] };
export const compositionDependency = compositionModuleRef;
