/**
 * Runtime publication port. Applications and history browsers use the package root instead.
 * Open drafts, writer state and recovery operations are deliberately isolated here.
 */
export {
  assertBuildResultFileRef,
  assertBuildResultPath,
  assertBuildFinalizationSeed,
} from "./types.js";
export type {
  BuildResultFileRef,
  StoredBuildResultOutput,
  BuildResultDraft,
  StoredFinishedBuildResult,
  StoredBuildResult,
  BuildFinalizationSeed,
  BuildFinalizationResourceSource,
  BuildFinalizationSync,
  BuildFinalizationFinish,
  BuildFinalizer,
  BuildFinalizationStore,
} from "./types.js";
export {
  decodeStoredBuildResult,
  encodeStoredBuildResult,
} from "./decode.js";
export { preserveExecutionLog } from "./execution-log.js";
export {
  FileBuildFinalization,
  FileBuildFinalizationStore,
} from "./store.js";
export { buildResultDirectory } from "@hypit/result/node";
