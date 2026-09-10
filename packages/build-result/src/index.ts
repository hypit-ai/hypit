export {
  assertBuildResultValueDocument,
  assertBuildResultSeed,
} from "./types.js";
export {
  decodeBuildResultJson,
  decodeBuildResultManifest,
  decodeBuildResultValueDocument,
  decodeBuildResultWriterState,
  encodeBuildResultManifest,
} from "./decode.js";
export { syncBuildResultOutputs } from "./writer.js";
export {
  FileBuildResult,
  FileBuildResultRepository,
  applyBuildResultPresentation,
  browseBuildResults,
  buildResultDirectory,
  describeBuildResultOutput,
  normalizeBuildResultForwards,
  readBuildResult,
  resolveBuildResultOutput,
} from "./store.js";
export type * from "./types.js";
export type * from "./writer.js";

export { currentFileReference, fileReferenceIdentity, ownedFileReference, localExternalFiles } from "./file-reference.js";
export type { ExternalFileAccess } from "./file-reference.js";
