import { mediaDependency } from "@narratage/media";
import { narrativeDependency } from "@narratage/narrative";
import { programSpaceDependency } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, TypeRef } from "@narratage/protocol";
import { spatialDependency } from "@narratage/spatial";
import { speechAudioBasisSchema, speechBasisSchema, speechDurationSchema, speechEvidenceAudioSchema } from "./schema.js";
export const speechModuleRef = { name: "@narratage/speech", version: "1" } as const;
export const speechTypes = {
  duration: { module: speechModuleRef, name: "SpeechDuration" }, basis: { module: speechModuleRef, name: "SpeechBasis" },
  audioBasis: { module: speechModuleRef, name: "SpeechAudioBasis" }, evidenceAudio: { module: speechModuleRef, name: "SpeechEvidenceAudio" },
} satisfies Record<string, TypeRef>;
export const speechManifest: ModuleManifest = { format: "svml.module@1", name: speechModuleRef.name, version: speechModuleRef.version,
  dependencies: [narrativeDependency, mediaDependency, programSpaceDependency, spatialDependency],
  types: [{ name: speechTypes.duration.name, schema: speechDurationSchema }, { name: speechTypes.basis.name, schema: speechBasisSchema },
    { name: speechTypes.audioBasis.name, schema: speechAudioBasisSchema }, { name: speechTypes.evidenceAudio.name, schema: speechEvidenceAudioSchema }],
  capabilities: [], surfaces: [], producers: [] };
export const speechManifestDigest = digestOf(speechManifest);
export const speechDependency = { module: speechModuleRef, digest: speechManifestDigest } as const;
