export { assertSemanticTakeIdentity, assertSpeechDurationIdentity, assertSpeechEvidenceAudioIdentity, sealSemanticTake, sealSpeechDuration, sealSpeechEvidenceAudio, speechEvidenceSampleBoundary } from "./identity.js";
export { speechComponent } from "./component.js";
export { materializeSegmentBoundaryTake, materializeSemanticTake } from "./materialize.js";
export { speechDependency, speechManifest, speechModuleRef, speechProducers, speechTypes } from "./manifest.js";
export { semanticTakeSchema, speechDurationSchema, speechEvidenceAudioSchema } from "./schema.js";
export type * from "./types.js";
