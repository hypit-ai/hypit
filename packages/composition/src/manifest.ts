import { mediaDependency, programSpaceDependency } from "./schema.js";
import { visualIrDependency } from "@hypit/visual-ir";
import type { ModuleManifest, TypeRef } from "@hypit/protocol";
import { audioTrackSchema, compositionSchema, visualTrackSchema } from "./schema.js";
export const compositionModuleRef = { name: "@hypit/composition", version: "1" } as const;
export const compositionTypes = { visualTrack: { module: compositionModuleRef, name: "VisualTrack" }, audioTrack: { module: compositionModuleRef, name: "AudioTrack" }, composition: { module: compositionModuleRef, name: "Composition" } } satisfies Record<string, TypeRef>;
export const compositionManifest: ModuleManifest = { format: "hypit.module@1", name: compositionModuleRef.name, version: compositionModuleRef.version,
  dependencies: [mediaDependency, programSpaceDependency, visualIrDependency], types: [
    { name: compositionTypes.visualTrack.name },
    { name: compositionTypes.audioTrack.name },
    { name: compositionTypes.composition.name },
  ], capabilities: [], producers: [] };
export const compositionDependency = { module: compositionModuleRef } as const;
