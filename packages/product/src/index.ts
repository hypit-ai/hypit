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
export { decodeProductValueDocument, decodeStoredProduct } from "./decode.js";
export type {
  ProductExport,
  ProductExportBytes,
  ProductExportContext,
  ProductExporter,
  ProductExporterFacet,
} from "./exporter.js";
