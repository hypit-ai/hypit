export {
  maskSourceHeader,
  parseSourceHeader,
  SourceHeaderError,
} from "./header.js";
export type { SourceHeader } from "./header.js";
export type {
  Awaitable,
  ResolvedSourceAsset,
  SourceAssetRequest,
  SourceAssetResolver,
  SourceImportRequest,
  SourceResolver,
  SourceUnit,
} from "./unit.js";
/** Logical package address for Source Frontends selected by a Source Header. */
export const sourceFrontendPackageAbi = "hypit.source-frontend@1";
