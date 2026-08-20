export { MarkupFrontendError } from "./error.js";
export {
  assertAttributes,
  assertEmptyElement,
  assertExactAttributes,
  localName,
  optionalTextAttribute,
  textAttribute,
} from "./element.js";
export { decodeMarkup, createMarkupAuthorFrontend, markupAuthorFrontendId } from "./frontend.js";
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
