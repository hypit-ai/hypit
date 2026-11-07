/**
 * Runtime publication port. Applications and history browsers use the package root instead.
 * Open drafts, writer state and recovery operations are deliberately isolated here.
 */
export {
  assertBuildResultFileRef,
  assertBuildResultPath,
  assertRunFinalizationSeed,
} from "./types.js";
export type {
  BuildResultFileRef,
  StoredBuildResultOutput,
  BuildResultDraft,
  StoredFinishedBuildResult,
  StoredBuildResult,
  RunFinalizationSeed,
  RunFinalizationResourceSource,
  RunFinalizationSync,
  RunFinalizationFinish,
  RunFinalizer,
  RunFinalizationStore,
} from "./types.js";
export {
  decodeStoredBuildResult,
  encodeStoredBuildResult,
} from "./decode.js";
export { preserveExecutionLog } from "./execution-log.js";
export {
  FileRunFinalization,
  FileRunFinalizationStore,
} from "./store.js";
export { buildResultDirectory } from "@hypit/result/node";
