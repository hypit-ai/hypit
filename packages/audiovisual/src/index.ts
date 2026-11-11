export {
  assertOccurrence,
  assertOccurrencePlacement,
  assertProgramSource,
  occurrenceParentRange,
  sealOccurrence,
} from "./occurrence.js";
export { audioType, audiovisualModuleRef, pictureType } from "./identity.js";
export {
  assertAudioOperator,
  assertOperatorTemporalSupport,
  assertPictureOperator,
  assertSignalOperatorProgram,
  assertSignalReconstruction,
  isPointwiseOperatorTemporalSupport,
  pointwiseOperatorTemporalSupport,
} from "./operator.js";
export { audiovisualComponent } from "./component.js";
export {
  audiovisualDependency,
  audiovisualManifest,
  audiovisualProducers,
  audiovisualTypes,
  signalOperatorProgramSchema,
} from "./manifest.js";
export {
  assertSpatialMapControl,
  evaluateMappedSpatialMapControl,
  evaluateSpatialMapControl,
  sealSpatialMapControl,
  spatialMapControlDomains,
} from "./control.js";
export {
  assertTemporalControl,
  assertTemporalControlMapping,
  evaluateTemporalControl,
  resolveTemporalControlPosition,
} from "@hypit/temporal/algebra";
export type { TemporalControl, TemporalControlSegment } from "@hypit/temporal/algebra";
export { createAudiovisualProgramEvaluator, evaluateAudiovisualProgramAt } from "./evaluation.js";
export {
  assertPictureGraph,
  pictureGraphUses,
} from "./picture.js";
export { assertAudioGraph, audioGraphUses } from "./audio.js";
export {
  assertAudiovisualProgram,
  audiovisualProgramOccurrences,
  audiovisualProgramSource,
  sealAudiovisualProgram,
} from "./program.js";
export type * from "./types.js";
