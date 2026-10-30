/**
 * Runtime publication port. Applications and history browsers use the package root instead.
 * Open drafts, writer state and recovery operations are deliberately isolated here.
 */
export {
  assertBuildResultSeed,
  defineBuildResultOutput,
} from "./types.js";
export type {
  BuildResultDraft,
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
  decodeBuildResultWriterState,
  encodeStoredBuildResult,
} from "./decode.js";
export { syncBuildResultOutputs } from "./writer.js";
export type { BuildResultWriterState, BuildResultWriteTarget } from "./writer.js";
export { preserveExecutionLog } from "./execution-log.js";
