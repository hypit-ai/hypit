export { MarkupFrontendError } from "./error.js";
export {
  MarkupDeclarationRegistry,
  createMarkupDeclarationFacet,
  installMarkupDeclarationFacets,
  markupDeclarationFacetAbi,
} from "./declaration-registry.js";
export type {
  MarkupDeclarationRegistryLike,
  MarkupDeclarationSyntax,
  RegisteredMarkupDeclaration,
} from "./declaration-registry.js";
export {
  closeDocument,
  discoverMarkup,
  parseOpeningTag,
  parseStructuredElement,
  skipTextTrivia,
} from "./syntax.js";
export type { MarkupAttributeSyntax, OpeningTag } from "./syntax.js";
export {
  applyMarkupDocumentOperations,
  createMarkupDeclarationAuthorFrontend,
  createMarkupDocumentFrontend,
  declarationsFromMarkupDocument,
  decodeMarkupDeclarations,
  markupDeclarationAuthorFrontendId,
  parseMarkupDocument,
  printMarkupDocument,
} from "./document.js";
export type {
  MarkupDocument,
  MarkupDocumentComment,
  MarkupDocumentElement,
  MarkupDocumentFrontendOptions,
  MarkupDocumentNode,
  MarkupDocumentText,
  MarkupDeclarationDecodeOptions,
  MarkupDeclarationAuthorFrontendOptions,
} from "./document.js";
export type * from "./types.js";
