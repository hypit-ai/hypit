import { ModulePackageRegistry, Compiler } from "@hypit/compiler";
import {
  AuthorDeclarationRegistry,
  AuthorFrontendRegistry,
  declarationField,
  sealGraphFragment,
  type AuthorDeclarationCompiler,
} from "@hypit/author";
import type { AuthorSourceAssetRequest, AuthorSourceImport, AuthorSourceUnit } from "@hypit/author";
import type { BlobRef, ModuleManifest, ModuleRef, ProducerRef, TypeRef } from "@hypit/protocol";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";
import type { BlobAttachment, Workspace } from "@hypit/workspace";
import { WorkspaceError } from "@hypit/workspace";
import {
  createMarkupDeclarationAuthorFrontend,
  MarkupDeclarationRegistry,
} from "@hypit/markup";
import {
  realizationAuthorDeclarations,
  realizationManifest,
  realizationMarkupDeclarations,
  realizationModuleRef,
} from "@hypit/realization";
import { NodeFilesystemWorkspace } from "@hypit/workspace/node";
import { RefinementRegistry } from "@hypit/refinement";

export const rawSourceAdapter = (unit: import("@hypit/source").SourceUnit) => ({ unit, frontend: "test.frontend@1" });

export function emptyManifest(name: string, version = "1"): ModuleManifest {
  return {
    format: "hypit.module@1",
    name,
    version,
    dependencies: [],
    types: [],
    capabilities: [],
    producers: [],
  };
}

export const laboratory = { name: "example.compiler-lab", version: "1" } as const;
export const resultType = { module: laboratory, name: "Result" } satisfies TypeRef;
const producer = { module: laboratory, name: "produce" } satisfies ProducerRef;
const resultSyntax = { declaration: "result", tag: "Result" } as const;
const acceptedSyntax = { declaration: "accepted", tag: "Accepted" } as const;
const laboratoryManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: laboratory.name,
  version: laboratory.version,
  dependencies: [],
  types: [resultType.name],
  capabilities: [],
  producers: [{
    name: producer.name,
    inputs: [],
    result: { kind: "output" as const, name: "result", type: resultType },
  }],
};
const fragment = sealGraphFragment({
  inputs: [],
  operations: [{
    id: "produce",
    producer,
    inputs: {},
    result: { kind: "output" as const, name: "result" },
  }],
  exports: [{
    name: "result",
    type: resultType,
    root: { kind: "fragment-operation", operation: "produce" },
  }],
});
const resultDeclaration: AuthorDeclarationCompiler = {
  module: laboratory,
  declaration: "result",
  outputs: [resultType],
  shape: {
    summary: "Produces one test Result.",
    fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the Result." }],
  },
  bindings(declaration) {
    const id = declarationField(declaration, "id");
    if (id?.kind !== "literal") throw new Error("Result id is required");
    return [{ name: `${id.value}.result`, ref: { kind: "component-output", component: id.value, output: "result" }, type: resultType }];
  },
  compile({ declaration }) {
    const id = declarationField(declaration, "id");
    if (id?.kind !== "literal") throw new Error("Result id is required");
    return { records: [], components: [{ id: id.value, fragment, inputs: {}, outputs: { result: `${id.value}.result` }, range: declaration.range }] };
  },
};

const acceptedDeclaration: AuthorDeclarationCompiler = {
  module: laboratory,
  declaration: "accepted",
  outputs: [resultType],
  shape: {
    summary: "Authors one accepted test Result.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the accepted Result." },
      { name: "value", kind: "literal", required: true, summary: "Provides its value." },
    ],
  },
  bindings(declaration) {
    const id = declarationField(declaration, "id");
    if (id?.kind !== "literal") throw new Error("Accepted id is required");
    return [{ name: id.value, ref: { kind: "record", id: id.value }, type: resultType }];
  },
  compile({ declaration }) {
    const id = declarationField(declaration, "id");
    const value = declarationField(declaration, "value");
    if (id?.kind !== "literal" || value?.kind !== "literal") {
      throw new Error("Accepted id and value are required");
    }
    return {
      records: [{ id: id.value, type: resultType, value: value.value, range: declaration.range }],
      components: [],
    };
  },
};

const assetLaboratory = { name: "example.asset-lab", version: "1" } as const;
const assetType = { module: assetLaboratory, name: "Asset" } satisfies TypeRef;
const assetSyntax = { declaration: "asset", tag: "Asset" } as const;
const assetManifest: ModuleManifest = {
  ...emptyManifest(assetLaboratory.name),
  types: [assetType.name],
};
const assetDeclaration: AuthorDeclarationCompiler = {
  module: assetLaboratory,
  declaration: "asset",
  outputs: [assetType],
  shape: {
    summary: "Resolves one test Asset.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the Asset." },
      { name: "src", kind: "literal", required: true, summary: "Selects its source." },
    ],
  },
  bindings(declaration) {
    const id = declarationField(declaration, "id");
    if (id?.kind !== "literal") throw new Error("Asset id is required");
    return [{ name: id.value, ref: { kind: "record", id: id.value }, type: assetType }];
  },
  async compile({ declaration, resolveAsset }) {
    const id = declarationField(declaration, "id");
    const src = declarationField(declaration, "src");
    if (id?.kind !== "literal" || src?.kind !== "literal") throw new Error("Asset id and src are required");
    const resolved = await resolveAsset({
      from: src.value,
      mediaType: "application/octet-stream",
      ...(src.value === "package:example.asset-lab/embedded.bin"
        ? { bytes: new Uint8Array([8, 6, 7, 5, 3, 0, 9]) }
        : {}),
      range: declaration.range,
    });
    return { records: [{ id: id.value, type: assetType, value: resolved, range: declaration.range }], components: [] };
  },
};

export function compiler(
  root: string,
  additional: readonly ModuleManifest[] = [],
  onDiscover?: () => void,
): Compiler {
  const modules = new ModulePackageRegistry();
  modules.register({ manifest: laboratoryManifest });
  modules.register({ manifest: realizationManifest });
  for (const manifest of additional) modules.register({ manifest });
  const declarations = new AuthorDeclarationRegistry();
  declarations.register(resultDeclaration);
  declarations.register(acceptedDeclaration);
  realizationAuthorDeclarations.forEach((declaration) => declarations.register(declaration));
  const syntax = new MarkupDeclarationRegistry();
  syntax.register({ module: laboratory, ...resultSyntax });
  syntax.register({ module: laboratory, ...acceptedSyntax });
  realizationMarkupDeclarations.forEach((declaration) => syntax.register({
    module: realizationModuleRef,
    declaration: declaration.name,
    tag: declaration.tag,
  }));
  const frontends = new AuthorFrontendRegistry();
  const frontend = createMarkupDeclarationAuthorFrontend({
    syntax,
    compilers: declarations,
    resolveModule(request): ModuleRef {
      const resolved = modules.resolve(request.from);
      if (resolved === undefined) throw new Error(`unknown module ${request.from}`);
      return resolved;
    },
  });
  frontends.register({
    ...frontend,
    discover(source) {
      onDiscover?.();
      return frontend.discover(source);
    },
  });
  return new Compiler({ modules, frontends, refinements: new RefinementRegistry(), workspace: new NodeFilesystemWorkspace({ root }) });
}

export const previewModule = { name: "example.compiler-preview", version: "1" } as const;
export const previewProducer = { module: previewModule, name: "preview" } satisfies ProducerRef;
export const consumeProducer = { module: previewModule, name: "consume" } satisfies ProducerRef;
export const previewManifest: ModuleManifest = {
  ...emptyManifest(previewModule.name),
  dependencies: [laboratory],
  producers: [{
    name: previewProducer.name,
    inputs: [],
    result: { kind: "output" as const, name: "result", type: resultType },
  }, {
    name: consumeProducer.name,
    inputs: [{ name: "source", type: resultType }],
    result: { kind: "output" as const, name: "result", type: resultType },
  }],
};
export const previewFragment = sealGraphFragment({
  inputs: [],
  operations: [{
    id: "preview",
    producer: previewProducer,
    inputs: {},
    result: { kind: "output" as const, name: "result" },
  }],
  exports: [{
    name: "result",
    type: resultType,
    root: { kind: "fragment-operation", operation: "preview" },
  }],
});
export const consumeFragment = sealGraphFragment({
  inputs: [{ name: "source", type: resultType }],
  operations: [{
    id: "consume",
    producer: consumeProducer,
    inputs: { source: { kind: "fragment-input", name: "source" } },
    result: { kind: "output" as const, name: "result" },
  }],
  exports: [{
    name: "result",
    type: resultType,
    root: { kind: "fragment-operation", operation: "consume" },
  }],
});

export function assetCompiler(environment: { readonly root: string } | { readonly workspace: Workspace }): Compiler {
  const modules = new ModulePackageRegistry();
  modules.register({ manifest: assetManifest });
  modules.register({ manifest: laboratoryManifest });
  const declarations = new AuthorDeclarationRegistry();
  declarations.register(resultDeclaration);
  declarations.register(assetDeclaration);
  const syntax = new MarkupDeclarationRegistry();
  syntax.register({ module: laboratory, ...resultSyntax });
  syntax.register({ module: assetLaboratory, ...assetSyntax });
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupDeclarationAuthorFrontend({
    syntax,
    compilers: declarations,
    resolveModule(request): ModuleRef {
      const resolved = modules.resolve(request.from);
      if (resolved === undefined) throw new Error(`unknown module ${request.from}`);
      return resolved;
    },
  }));
  return new Compiler({
    modules,
    frontends,
    refinements: new RefinementRegistry(),
    workspace: "workspace" in environment
      ? environment.workspace
      : new NodeFilesystemWorkspace({ root: environment.root }),
  });
}

export function memoryWorkspace(sourceText: string, assetBytes: Uint8Array): Workspace {
  return {
    async open(entryLocator) {
      const entry = resolveSelfDescribedTextSource({ id: entryLocator, name: "main.svml", text: sourceText });
      let attachment: { readonly blob: BlobRef; readonly open: () => AsyncIterable<Uint8Array> } | undefined;
      return {
        entry,
        async resolveSource(_importer: AuthorSourceUnit, request: AuthorSourceImport) {
          throw new WorkspaceError("UNKNOWN_MEMORY_SOURCE", `No memory source satisfies ${request.from}`, request.from);
        },
        async resolveAsset(importer: AuthorSourceUnit, request: AuthorSourceAssetRequest) {
          if (importer !== entry.unit || request.from !== "./reference.bin") {
            throw new WorkspaceError("UNKNOWN_MEMORY_ASSET", `No memory asset satisfies ${request.from}`, request.from);
          }
          const bytes = Uint8Array.from(assetBytes);
          const blob: BlobRef = {
            kind: "blob",
            resource: "res_memory-reference",
            size: bytes.byteLength,
            mediaType: request.mediaType,
          };
          attachment = { blob, open: async function* () { yield Uint8Array.from(bytes); } };
          return { ...blob };
        },
        attachments() {
          return attachment === undefined
            ? []
            : [{ blob: { ...attachment.blob }, open: attachment.open }];
        },
      };
    },
  };
}

export async function readAttachment(attachment: BlobAttachment | undefined): Promise<Uint8Array | undefined> {
  if (attachment === undefined) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of await attachment.open()) {
    chunks.push(Uint8Array.from(chunk));
    size += chunk.byteLength;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
