export type {
  Awaitable,
  ResolvedSource,
  SourceAssetRequest,
  SourceAssetReader,
  SourceAssetResolver,
  SourceImportRequest,
  SourceResolver,
  SourceRange,
  SourceUnit,
} from "./unit.js";
export { decodeSourceText } from "./unit.js";
/** Logical package address for Frontend facets selected by a ResolvedSource authority. */
export const sourceFrontendPackageAbi = "hypit.source-frontend@1";
