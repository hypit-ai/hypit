import type { Facet } from "@hypit/facet";
import { sameType, type BlobRef, type TypeRef, type Value } from "@hypit/protocol";

export type ProductExportBytes = Uint8Array | AsyncIterable<Uint8Array>;

export type ProductExport = {
  readonly bytes: ProductExportBytes;
};

export type ProductExportContext = {
  readonly name: string;
  readonly type: TypeRef;
  readonly value: Value;
  /** Opens only Resource leaves owned by this Product. */
  readonly openResource: (blob: BlobRef) => Promise<AsyncIterable<Uint8Array> | undefined>;
};

export type ProductExporter = {
  readonly type: TypeRef;
  export(context: ProductExportContext): ProductExport | Promise<ProductExport>;
};

export const productExporterFacetAbi = "hypit.product-exporter@1";

export type ProductExporterFacet = Facet & {
  readonly abi: typeof productExporterFacetAbi;
  readonly implementation: ProductExporter;
};

export function createProductExporterFacet(exporter: ProductExporter): ProductExporterFacet {
  return { abi: productExporterFacetAbi, implementation: exporter };
}

export function productExportersFromFacets(facets: readonly Facet[]): readonly ProductExporter[] {
  return facets.flatMap((facet) => facet.abi === productExporterFacetAbi
    ? [(facet as ProductExporterFacet).implementation]
    : []);
}

export function productExporterForType(
  exporters: readonly ProductExporter[],
  type: TypeRef,
): ProductExporter | undefined {
  const matches = exporters.filter((exporter) => sameType(exporter.type, type));
  if (matches.length > 1) throw new Error("Product Type has more than one exporter");
  return matches[0];
}
