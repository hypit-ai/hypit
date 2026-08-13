export {
  maskSourceHeader,
  parseSourceHeader,
  SourceHeaderError,
} from "./header.js";
export type { SourceHeader } from "./header.js";
export type {
  Awaitable,
  CompiledSourceIdentity,
  ResolvedSourceAsset,
  SourceAssetRequest,
  SourceAssetResolver,
  SourceImportRequest,
  SourceResolver,
  SourceUnit,
} from "./unit.js";
export {
  compiledSourceIdentity,
  verifyCompiledSourceIdentity,
} from "./unit.js";
/** Logical package address for Source Frontends selected by a Source Header. */
export const sourceFrontendPackageAbi = "svml.source-frontend@1";
