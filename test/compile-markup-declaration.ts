import {
  AuthorDeclarationRegistry,
  compileAuthorDeclarations,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
  type DecodedAuthorSource,
} from "@hypit/author";
import {
  declarationsFromMarkupDocument,
  MarkupDeclarationRegistry,
  parseMarkupDocument,
  type MarkupDeclarationSyntax,
} from "@hypit/markup";
import type { BlobRef, ModuleRef } from "@hypit/protocol";

type Options = {
  readonly source: string;
  readonly module: ModuleRef;
  readonly alias: string;
  readonly compilers: readonly AuthorDeclarationCompiler[];
  readonly syntax: readonly MarkupDeclarationSyntax[];
  readonly references?: ReadonlyMap<string, AuthorResolvedReference>;
  readonly resolveAsset?: (from: string, mediaType?: string) => BlobRef | Promise<BlobRef>;
  readonly readAsset?: (from: string, mediaType?: string) => Uint8Array | Promise<Uint8Array>;
};

/** Test one real Markup-to-Declaration path through the public declaration boundary. */
export async function compileMarkupDeclaration(options: Options): Promise<DecodedAuthorSource> {
  const declarations = new AuthorDeclarationRegistry();
  for (const compiler of options.compilers) declarations.register(compiler);
  const syntax = new MarkupDeclarationRegistry();
  for (const declaration of options.syntax) syntax.register({
    module: options.module,
    declaration: declaration.name,
    tag: declaration.tag,
    ...(declaration.body === undefined ? {} : { body: declaration.body }),
  });
  const text = `<svml>\n<import from="${options.module.name}@${options.module.version}" as="${options.alias}"/>\n${options.source}\n</svml>`;
  const source = { name: "test.svml", text };
  const document = parseMarkupDocument(source);
  const authored = declarationsFromMarkupDocument(document, {
    resolveModule: () => options.module,
    declarations: syntax,
  });
  return await compileAuthorDeclarations({
    sourceName: source.name,
    declarations: authored,
    registry: declarations,
    resolveReference: (path) => options.references?.get(path),
    resolveAsset: async (request) => {
      if (options.resolveAsset === undefined) throw new Error(`No test Asset resolver for ${request.from}.`);
      return await options.resolveAsset(request.from, request.mediaType);
    },
    ...(options.readAsset === undefined ? {} : {
      readAsset: async (request) => await options.readAsset!(request.from, request.mediaType),
    }),
  });
}
