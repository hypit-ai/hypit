import { mediaDependency } from "@hypit/media";
import { narrativeDependency } from "@hypit/narrative";
import { programSpaceDependency } from "@hypit/program-space";
import type { ModuleManifest, TypeRef } from "@hypit/protocol";
import { spatialDependency } from "@hypit/spatial";
import { speechAudioBasisSchema, speechBasisSchema, speechDurationSchema, speechEvidenceAudioSchema } from "./schema.js";
export const speechModuleRef = { name: "@hypit/speech", version: "1" } as const;
export const speechTypes = {
  duration: { module: speechModuleRef, name: "SpeechDuration" }, basis: { module: speechModuleRef, name: "SpeechBasis" },
  audioBasis: { module: speechModuleRef, name: "SpeechAudioBasis" }, evidenceAudio: { module: speechModuleRef, name: "SpeechEvidenceAudio" },
} satisfies Record<string, TypeRef>;
export const speechManifest: ModuleManifest = { format: "hypit.module@1", name: speechModuleRef.name, version: speechModuleRef.version,
  dependencies: [narrativeDependency, mediaDependency, programSpaceDependency, spatialDependency],
  types: [{ name: speechTypes.duration.name }, { name: speechTypes.basis.name },
    { name: speechTypes.audioBasis.name }, { name: speechTypes.evidenceAudio.name }],
  capabilities: [], producers: [] };
export const speechDependency = { module: speechModuleRef } as const;
