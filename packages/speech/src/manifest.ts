import { mediaDependency, mediaTypes } from "@hypit/media";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { semanticTakeSchema, speechDurationSchema, speechEvidenceAudioSchema } from "./schema.js";
export const speechModuleRef = { name: "@hypit/speech", version: "1" } as const;
export const speechTypes = {
  duration: { module: speechModuleRef, name: "SpeechDuration" },
  evidenceAudio: { module: speechModuleRef, name: "SpeechEvidenceAudio" },
  semanticTake: { module: speechModuleRef, name: "SemanticTake" },
} satisfies Record<string, TypeRef>;
export const speechProducers = {
  materializeSegmentBoundaries: { module: speechModuleRef, name: "materialize-segment-boundaries" },
} satisfies Record<string, ProducerRef>;
export const speechManifest: ModuleManifest = { format: "hypit.module@1", name: speechModuleRef.name, version: speechModuleRef.version,
  dependencies: [mediaDependency, narrativeDependency],
  types: [{ name: speechTypes.duration.name },
    { name: speechTypes.evidenceAudio.name },
    { name: speechTypes.semanticTake.name }],
  capabilities: [],
  producers: [{
    name: speechProducers.materializeSegmentBoundaries.name,
    inputs: [
      { name: "narrative", type: narrativeTypes.narrative },
      { name: "segment", type: narrativeTypes.excerpt },
      { name: "media", type: mediaTypes.synchronized },
    ],
    outputs: [{ name: "take", type: speechTypes.semanticTake }],
    needs: [],
  }] };
export const speechDependency = { module: speechModuleRef } as const;
