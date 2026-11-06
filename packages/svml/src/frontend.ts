import {
  compileAuthorDeclarations,
  type AuthorDeclarationRegistryLike,
  type AuthorFrontend,
  type AuthorResolvedReference,
  type AuthorSourceAssetRequest,
  type DecodedAuthorSource,
  type ResolvedAuthorSourceImport,
} from "@hypit/author";
import type { BlobRef } from "@hypit/protocol";
import { decodeSourceText, type SourceUnit } from "@hypit/source";

import { declarationsFromSvmlDocument, svmlStructureFrontend } from "./document.js";
import { SvmlFrontendError } from "./error.js";
import { parseSvmlDocument } from "./parser.js";

export const svmlAuthorFrontendId = "@hypit/svml@1";

export type SvmlDeclarationDecodeOptions = {
  readonly compilers: AuthorDeclarationRegistryLike;
  readonly sourceImports?: readonly ResolvedAuthorSourceImport[];
  readonly resolveAsset?: (request: AuthorSourceAssetRequest) => BlobRef | Promise<BlobRef>;
  readonly readAsset?: (request: AuthorSourceAssetRequest) => Uint8Array | Promise<Uint8Array>;
};

export async function decodeSvmlDeclarations(
  source: SourceUnit,
  options: SvmlDeclarationDecodeOptions,
): Promise<DecodedAuthorSource> {
  const document = parseSvmlDocument(source);
  const imported = new Map<string, AuthorResolvedReference>();
  const sourceImports = new Map((options.sourceImports ?? []).map((item) => [
    `${item.request.from}\u0000${item.request.alias}`,
    item,
  ]));
  for (const request of document.imports) {
    if (request.kind !== "source") continue;
    const item = sourceImports.get(`${request.from}\u0000${request.alias}`);
    if (item === undefined) {
      throw new SvmlFrontendError(
        "SVML_SOURCE_IMPORT_UNRESOLVED",
        `Source import ${JSON.stringify(request.from)} must be decoded before this Source.`,
        source.name,
        request.range.start,
      );
    }
    const records = new Map(item.records.map((record) => [record.id, record]));
    for (const value of item.exports) {
      const path = `${request.alias}.${value.name}`;
      if (imported.has(path)) {
        throw new SvmlFrontendError(
          "SVML_SOURCE_EXPORT_COLLISION",
          `Imported binding ${path} is duplicated.`,
          source.name,
          request.range.start,
        );
      }
      const record = value.ref.kind === "record" ? records.get(value.ref.id) : undefined;
      imported.set(path, {
        ref: value.ref,
        type: value.type,
        ...(record === undefined ? {} : { record }),
      });
    }
  }
  return await compileAuthorDeclarations({
    sourceName: source.name,
    declarations: declarationsFromSvmlDocument(document),
    registry: options.compilers,
    resolveReference: (path) => imported.get(path),
    resolveAsset: async (request) => {
      if (options.resolveAsset === undefined) {
        throw new SvmlFrontendError(
          "SVML_ASSET_RESOLVER_MISSING",
          `Declaration requested ${request.from}, but this Host has no asset resolver.`,
          source.name,
          request.range?.start ?? 0,
        );
      }
      return await options.resolveAsset(request);
    },
    readAsset: async (request) => {
      if (options.readAsset === undefined) {
        throw new SvmlFrontendError(
          "SVML_ASSET_READER_MISSING",
          `Declaration requested readable input ${request.from}, but this Host has no asset reader.`,
          source.name,
          request.range?.start ?? 0,
        );
      }
      return await options.readAsset(request);
    },
  });
}

export function createSvmlAuthorFrontend(
  options: { readonly compilers: AuthorDeclarationRegistryLike },
): AuthorFrontend {
  return {
    id: svmlAuthorFrontendId,
    structure: svmlStructureFrontend,
    discover(source) {
      const document = parseSvmlDocument(source);
      return {
        modules: document.imports.filter((item) => item.kind === "module").map((item) => item.from),
        sources: document.imports.filter((item) => item.kind === "source")
          .map((item) => ({ from: item.from, alias: item.alias, range: { ...item.range } })),
      };
    },
    async decode(source, context) {
      return await decodeSvmlDeclarations(source, {
        compilers: options.compilers,
        sourceImports: context.imports,
        resolveAsset: context.resolveAsset,
        ...(context.readAsset === undefined ? {} : { readAsset: context.readAsset }),
      });
    },
  };
}

export function svmlSourceText(source: SourceUnit): string {
  return decodeSourceText(source);
}
