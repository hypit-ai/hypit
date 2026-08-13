import { mediaDependency, programSpaceDependency } from "./schema.js";
import { visualIrDependency } from "@narratage/visual-ir";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, TypeRef } from "@narratage/protocol";
import { audioTrackSchema, compositionSchema, visualTrackSchema } from "./schema.js";
export const compositionModuleRef = { name: "@narratage/composition", version: "1" } as const;
export const compositionTypes = { visualTrack: { module: compositionModuleRef, name: "VisualTrack" }, audioTrack: { module: compositionModuleRef, name: "AudioTrack" }, composition: { module: compositionModuleRef, name: "Composition" } } satisfies Record<string, TypeRef>;
export const compositionValidatorDigests = { visualTrack: digestOf("@narratage/composition/validate-visual-track@1"), audioTrack: digestOf("@narratage/composition/validate-audio-track@1"), composition: digestOf("@narratage/composition/validate-composition@1") } as const;
const validator = (digest: ReturnType<typeof digestOf>) => ({ implementation: { digest } });
export const compositionManifest: ModuleManifest = { format: "svml.module@1", name: compositionModuleRef.name, version: compositionModuleRef.version,
  dependencies: [mediaDependency, programSpaceDependency, visualIrDependency], types: [
    { name: compositionTypes.visualTrack.name, schema: visualTrackSchema, validator: validator(compositionValidatorDigests.visualTrack) },
    { name: compositionTypes.audioTrack.name, schema: audioTrackSchema, validator: validator(compositionValidatorDigests.audioTrack) },
    { name: compositionTypes.composition.name, schema: compositionSchema, validator: validator(compositionValidatorDigests.composition) },
  ], capabilities: [], producers: [] };
export const compositionManifestDigest = digestOf(compositionManifest);
export const compositionDependency = { module: compositionModuleRef, digest: compositionManifestDigest } as const;
