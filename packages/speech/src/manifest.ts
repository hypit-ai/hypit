import { mediaDependency } from "@hypit/media";
import { programSpaceDependency } from "@hypit/program-space";
import type { ModuleManifest, TypeRef } from "@hypit/protocol";
import { spatialDependency } from "@hypit/spatial";
import { semanticTakeSchema, speechBasisSchema, speechDurationSchema, speechEvidenceAudioSchema } from "./schema.js";
export const speechModuleRef = { name: "@hypit/speech", version: "1" } as const;
export const speechTypes = {
  duration: { module: speechModuleRef, name: "SpeechDuration" }, basis: { module: speechModuleRef, name: "SpeechBasis" },
  evidenceAudio: { module: speechModuleRef, name: "SpeechEvidenceAudio" },
  semanticTake: { module: speechModuleRef, name: "SemanticTake" },
} satisfies Record<string, TypeRef>;
export const speechManifest: ModuleManifest = { format: "hypit.module@1", name: speechModuleRef.name, version: speechModuleRef.version,
  dependencies: [mediaDependency, programSpaceDependency, spatialDependency],
  types: [{ name: speechTypes.duration.name }, { name: speechTypes.basis.name },
    { name: speechTypes.evidenceAudio.name },
    { name: speechTypes.semanticTake.name }],
  capabilities: [], producers: [] };
export const speechDependency = { module: speechModuleRef } as const;
