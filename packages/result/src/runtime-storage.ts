/**
 * Runtime publication port. Applications and history browsers use the package root instead.
 * Open drafts, writer state and recovery operations are deliberately isolated here.
 */
export {
  assertBuildResultFileRef,
  assertBuildResultPath,
  assertBuildResultValueDocument,
  assertBuildResultSeed,
  defineStoredBuildResultOutput,
  storedBuildResultOutput,
} from "./types.js";
export type {
  BuildResultFileRef,
  StoredBuildResultOutputValue,
  StoredBuildResultOutput,
  BuildResultValuePath,
  BuildResultResourceBinding,
  BuildResultValueDocument,
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
  decodeBuildResultValueDocument,
  decodeStoredBuildResult,
  decodeBuildResultWriterState,
  encodeStoredBuildResult,
} from "./decode.js";
export { syncBuildResultOutputs } from "./writer.js";
export type { BuildResultWriterState, BuildResultWriteTarget } from "./writer.js";
export { preserveExecutionLog } from "./execution-log.js";
