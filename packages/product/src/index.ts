/** Exact publication surface for typed products that outlive one Run. */
export const productPublisher = "hypit.product@1";

/**
 * Common publication answer for generated and analyzed products.
 *
 * The producing package still owns whether an output is a product, while its Type owner owns
 * validation and author-format export. This surface keeps no registry of models or result Types.
 */
export const productPublication = Object.freeze({
  publisher: productPublisher,
});

export { productAddress } from "./address.js";
export type { ProductAddress } from "./address.js";
export { productFromStored } from "./history.js";
export type {
  Product,
  ProductFileRange,
  ProductHistory,
  ResolvedProduct,
} from "./history.js";

export type { StoredProductPublication } from "./publication.js";

export { assertProductFileRef, assertProductPath, materializeProducts } from "./materialize.js";
export type {
  ProductFileRef,
  ProductMaterializationState,
  ProductMaterializationTarget,
  ProductResourceSource,
  ProductValueDocument,
  ProductValuePath,
  StoredProduct,
} from "./materialize.js";
export {
  createProductExporterFacet,
  productExporterForType,
  productExportersFromFacets,
  productExporterFacetAbi,
} from "./exporter.js";
export { decodeProduct, decodeProductValueDocument, decodeStoredProduct } from "./decode.js";
export { decodeStoredProductPublication } from "./decode.js";
export type {
  ProductExport,
  ProductExportBytes,
  ProductExportContext,
  ProductExporter,
  ProductExporterFacet,
} from "./exporter.js";
