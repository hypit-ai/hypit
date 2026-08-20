import { mediaDependency } from "@hypit/media";
import type { ModuleManifest, TypeRef } from "@hypit/protocol";
import { semanticTakeSchema, speechDurationSchema, speechEvidenceAudioSchema } from "./schema.js";
export const speechModuleRef = { name: "@hypit/speech", version: "1" } as const;
export const speechTypes = {
  duration: { module: speechModuleRef, name: "SpeechDuration" },
  evidenceAudio: { module: speechModuleRef, name: "SpeechEvidenceAudio" },
  semanticTake: { module: speechModuleRef, name: "SemanticTake" },
} satisfies Record<string, TypeRef>;
export const speechManifest: ModuleManifest = { format: "hypit.module@1", name: speechModuleRef.name, version: speechModuleRef.version,
  dependencies: [mediaDependency],
  types: [{ name: speechTypes.duration.name },
    { name: speechTypes.evidenceAudio.name },
    { name: speechTypes.semanticTake.name }],
  capabilities: [], producers: [] };
export const speechDependency = { module: speechModuleRef } as const;
