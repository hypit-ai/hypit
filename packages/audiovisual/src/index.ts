export type * from "./types.js";
export * from "./spatial.js";
export {
  assertImplementationBinding,
  assertPackageSymbol,
} from "./implementation.js";
export { assertSignalReconstruction, sealSignalReconstruction } from "./reconstruction.js";
export {
  assertOccurrence,
  assertOccurrencePlacement,
  assertProgramSource,
  occurrenceParentRange,
  sealOccurrence,
} from "./occurrence.js";
export {
  assertAudioOperator,
  assertOperatorTemporalSupport,
  assertPictureOperator,
  isPointwiseOperatorTemporalSupport,
  pointwiseOperatorTemporalSupport,
} from "./operator.js";
export {
  assertSpatialMapControl,
  assertTemporalControl,
  assertTemporalControlMapping,
  evaluateMappedSpatialMapControl,
  evaluateSpatialMapControl,
  evaluateTemporalControl,
  resolveTemporalControlPosition,
  sealSpatialMapControl,
  spatialMapControlDomains,
} from "./control.js";
export { assertPictureGraph, pictureGraphUses, pictureNodeSpatialDomains } from "./picture.js";
export { assertAudioGraph, audioGraphUses } from "./audio.js";
export {
  assertAudiovisualProgram,
  audiovisualProgramOccurrences,
  sealAudiovisualProgram,
} from "./program.js";
export { createAudiovisualProgramEvaluator, evaluateAudiovisualProgramAt } from "./evaluation.js";
export { resolvedMediaSource } from "./media.js";
