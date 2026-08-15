import { mediaDependency, programSpaceDependency } from "./schema.js";
import { visualIrDependency } from "@narratage/visual-ir";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, TypeRef } from "@narratage/protocol";
import { audioTrackSchema, compositionSchema, visualTrackSchema } from "./schema.js";
export const compositionModuleRef = { name: "@narratage/composition", version: "1" } as const;
export const compositionTypes = { visualTrack: { module: compositionModuleRef, name: "VisualTrack" }, audioTrack: { module: compositionModuleRef, name: "AudioTrack" }, composition: { module: compositionModuleRef, name: "Composition" } } satisfies Record<string, TypeRef>;
const validator = (digest: ReturnType<typeof digestOf>) => ({ implementation: { digest } });
export const compositionManifest: ModuleManifest = { format: "narratage.module@1", name: compositionModuleRef.name, version: compositionModuleRef.version,
  dependencies: [mediaDependency, programSpaceDependency, visualIrDependency], types: [
    { name: compositionTypes.visualTrack.name },
    { name: compositionTypes.audioTrack.name },
    { name: compositionTypes.composition.name },
  ], capabilities: [], producers: [] };
export const compositionDependency = { module: compositionModuleRef } as const;
