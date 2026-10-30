import type { Facet } from "@hypit/facet";
import { sameType, type BlobRef, type TypeRef, type Value } from "@hypit/protocol";

export type ResultOutputExportBytes = Uint8Array | AsyncIterable<Uint8Array>;

export type ResultOutputExport = {
  readonly bytes: ResultOutputExportBytes;
};

export type ResultOutputExportContext = {
  readonly name: string;
  readonly type: TypeRef;
  readonly value: Value;
  /** Opens only Resource leaves present in this retained value. */
  readonly openResource: (blob: BlobRef) => Promise<AsyncIterable<Uint8Array> | undefined>;
};

export type ResultOutputExporter = {
  readonly type: TypeRef;
  export(context: ResultOutputExportContext): ResultOutputExport | Promise<ResultOutputExport>;
};

export const resultOutputExporterFacetAbi = "hypit.result-output-exporter@1";

export type ResultOutputExporterFacet = Facet & {
  readonly abi: typeof resultOutputExporterFacetAbi;
  readonly implementation: ResultOutputExporter;
};

export function createResultOutputExporterFacet(
  exporter: ResultOutputExporter,
): ResultOutputExporterFacet {
  return { abi: resultOutputExporterFacetAbi, implementation: exporter };
}

export function resultOutputExportersFromFacets(
  facets: readonly Facet[],
): readonly ResultOutputExporter[] {
  return facets.flatMap((facet) => facet.abi === resultOutputExporterFacetAbi
    ? [(facet as ResultOutputExporterFacet).implementation]
    : []);
}

export function resultOutputExporterForType(
  exporters: readonly ResultOutputExporter[],
  type: TypeRef,
): ResultOutputExporter | undefined {
  const matches = exporters.filter((exporter) => sameType(exporter.type, type));
  if (matches.length > 1) throw new Error("Retained Output Type has more than one exporter");
  return matches[0];
}
