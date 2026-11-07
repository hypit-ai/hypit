/**
 * Runtime publication port. Applications and history browsers use the package root instead.
 * Open drafts, writer state and recovery operations are deliberately isolated here.
 */
export {
  assertBuildResultFileRef,
  assertBuildResultPath,
  assertBuildResultSeed,
} from "./types.js";
export type {
  BuildResultFileRef,
  StoredBuildResultOutput,
  BuildResultDraft,
  StoredFinishedBuildResult,
  StoredBuildResult,
  BuildResultSeed,
  BuildResultResourceSource,
  BuildResultSync,
  BuildResultFinish,
  BuildResultWriter,
  BuildResultStore,
} from "./types.js";
export {
  decodeStoredBuildResult,
  encodeStoredBuildResult,
} from "./decode.js";
export { preserveExecutionLog } from "./execution-log.js";
export {
  FileBuildResult,
  FileBuildResultStore,
} from "./store.js";
export { buildResultDirectory } from "@hypit/hypit/result/node";
