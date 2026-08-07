import { mediaDependency, programSpaceDependency } from "./schema.js";
import { visualIrDependency } from "@narratage/visual-ir";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, TypeRef } from "@narratage/protocol";
import { audioTrackSchema, compositionSchema, visualTrackSchema } from "./schema.js";
export const compositionModuleRef = { name: "@narratage/composition", version: "0.0.0-dev" } as const;
export const compositionTypes = { visualTrack: { module: compositionModuleRef, name: "VisualTrack" }, audioTrack: { module: compositionModuleRef, name: "AudioTrack" }, composition: { module: compositionModuleRef, name: "Composition" } } satisfies Record<string, TypeRef>;
export const compositionValidatorDigests = { visualTrack: digestOf("@narratage/composition/validate-visual-track@1"), audioTrack: digestOf("@narratage/composition/validate-audio-track@1"), composition: digestOf("@narratage/composition/validate-composition@1") } as const;
const validator = (locator: string, digest: ReturnType<typeof digestOf>) => ({ abi: "svml.type-validator@1" as const, implementation: { kind: "registered" as const, locator, digest } });
export const compositionManifest: ModuleManifest = { format: "svml.module@1", name: compositionModuleRef.name, version: compositionModuleRef.version,
  dependencies: [mediaDependency, programSpaceDependency, visualIrDependency], types: [
    { name: compositionTypes.visualTrack.name, schema: visualTrackSchema, validator: validator("@narratage/composition/validate-visual-track", compositionValidatorDigests.visualTrack) },
    { name: compositionTypes.audioTrack.name, schema: audioTrackSchema, validator: validator("@narratage/composition/validate-audio-track", compositionValidatorDigests.audioTrack) },
    { name: compositionTypes.composition.name, schema: compositionSchema, validator: validator("@narratage/composition/validate-composition", compositionValidatorDigests.composition) },
  ], capabilities: [], surfaces: [], producers: [] };
export const compositionManifestDigest = digestOf(compositionManifest);
export const compositionDependency = { module: compositionModuleRef, digest: compositionManifestDigest } as const;
