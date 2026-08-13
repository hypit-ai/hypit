export { MarkupFrontendError } from "./error.js";
export {
  decodeMarkup,
  createMarkupAuthorFrontend,
  markupAuthorFrontendId,
  markupFrontendImplementationDigest,
} from "./frontend.js";
export { MarkupSurfaceRegistry } from "./registry.js";
export {
  createMarkupSurfaceHostFacet,
  installMarkupSurfaceHostFacets,
  markupSurfaceHostFacetAbi,
} from "./host-facet.js";
export type { MarkupSurfaceHostFacetOptions } from "./host-facet.js";
export {
  closeDocument,
  discoverMarkup,
  parseOpeningTag,
  parseStructuredElement,
  skipTextTrivia,
} from "./syntax.js";
export type * from "./types.js";
