import type { Facet } from "@hypit/facet";
import { type BlobRef, type Value } from "@hypit/protocol";
import { sameType, type TypeRef } from "@hypit/module";

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

export const productExporterFacetKind = "hypit.product-exporter";

export type ProductExporterFacet = Facet & {
  readonly kind: typeof productExporterFacetKind;
  readonly implementation: ProductExporter;
};

export function createProductExporterFacet(exporter: ProductExporter): ProductExporterFacet {
  return { kind: productExporterFacetKind, implementation: exporter };
}

export function productExportersFromFacets(facets: readonly Facet[]): readonly ProductExporter[] {
  return facets.flatMap((facet) => facet.kind === productExporterFacetKind
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
