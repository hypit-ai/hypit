export { TextFrontendError } from "./error.js";
export {
  decodeText,
  createTextAuthorFrontend,
  textAuthorFrontendId,
  textFrontend,
  textFrontendImplementationDigest,
  textFrontendRef,
} from "./frontend.js";
export { TextSurfaceRegistry } from "./registry.js";
export {
  createTextSurfaceHostFacet,
  installTextSurfaceHostFacets,
  textSurfaceHostFacetAbi,
} from "./host-facet.js";
export type { TextSurfaceHostFacetOptions } from "./host-facet.js";
export {
  closeDocument,
  discoverText,
  parseOpeningTag,
  parseStructuredElement,
  skipTextTrivia,
} from "./syntax.js";
export type * from "./types.js";
