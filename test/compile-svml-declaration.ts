import {
  AuthorDeclarationRegistry,
  compileAuthorDeclarations,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
  type DecodedAuthorSource,
} from "@hypit/generation-authoring/author";
import type { BlobRef } from "@hypit/protocol";
import type { ModuleRef } from "@hypit/module";
import { declarationsFromSvmlDocument, parseSvmlDocument } from "@hypit/svml";

type Options = {
  readonly source: string;
  readonly module: ModuleRef;
  readonly alias: string;
  readonly compilers: readonly AuthorDeclarationCompiler[];
  readonly references?: ReadonlyMap<string, AuthorResolvedReference>;
  readonly resolveAsset?: (from: string, mediaType?: string) => BlobRef | Promise<BlobRef>;
  readonly readAsset?: (from: string, mediaType?: string) => Uint8Array | Promise<Uint8Array>;
};

/** Test one canonical SVML Block Source through the public declaration boundary. */
export async function compileSvmlDeclaration(options: Options): Promise<DecodedAuthorSource> {
  const declarations = new AuthorDeclarationRegistry();
  for (const compiler of options.compilers) declarations.register(compiler);
  const text = `module ${options.alias} from "${options.module.name}"

${options.source}
`;
  const source = {
    id: "test.svml",
    name: "test.svml",
    bytes: new TextEncoder().encode(text),
  };
  return await compileAuthorDeclarations({
    sourceName: source.name,
    declarations: declarationsFromSvmlDocument(parseSvmlDocument(source)),
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
