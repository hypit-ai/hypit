import { ModulePackageRegistry, Compiler } from "@hypit/compiler";
import { AuthorFrontendRegistry, sealGraphFragment } from "@hypit/author";
import type { AuthorSourceAssetRequest, AuthorSourceImport, AuthorSourceUnit } from "@hypit/author";
import type { BlobRef, ModuleManifest, ModuleRef, ProducerRef, TypeRef } from "@hypit/protocol";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";
import type { BlobAttachment, Workspace } from "@hypit/workspace";
import { WorkspaceError } from "@hypit/workspace";
import { createMarkupAuthorFrontend, MarkupSurfaceRegistry } from "@hypit/markup";
import { NodeFilesystemWorkspace } from "@hypit/workspace/node";

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
const resultSurface = {
  name: "result", tag: "Result", mode: "structured", outputs: [],
} as const;
const laboratoryManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: laboratory.name,
  version: laboratory.version,
  dependencies: [],
  types: [{ name: resultType.name }],
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

const assetLaboratory = { name: "example.asset-lab", version: "1" } as const;
const assetType = { module: assetLaboratory, name: "Asset" } satisfies TypeRef;
const assetSurface = {
  name: "asset", tag: "Asset", mode: "structured", outputs: [assetType],
} as const;
const assetManifest: ModuleManifest = {
  ...emptyManifest(assetLaboratory.name),
  types: [{ name: assetType.name }],
};

export function compiler(
  root: string,
  additional: readonly ModuleManifest[] = [],
  onDiscover?: () => void,
): Compiler {
  const modules = new ModulePackageRegistry();
  modules.register({ manifest: laboratoryManifest });
  for (const manifest of additional) modules.register({ manifest });
  const surfaces = new MarkupSurfaceRegistry();
  surfaces.registerStructured({
    module: laboratory,
    declaration: resultSurface,
    handler: ({ element }) => {
    const id = element.attributes.id;
    if (typeof id !== "string") throw new Error("Result id is required");
    return {
      records: [],
      components: [{
        id,
        fragment,
        inputs: {},
        outputs: { result: `${id}.result` },
        range: element.range,
      }],
    };
    },
  });
  const frontends = new AuthorFrontendRegistry();
  const frontend = createMarkupAuthorFrontend({
    registry: surfaces,
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
  return new Compiler({ modules, frontends, workspace: new NodeFilesystemWorkspace({ root }) });
}

export const previewModule = { name: "example.compiler-preview", version: "1" } as const;
export const previewProducer = { module: previewModule, name: "preview" } satisfies ProducerRef;
export const consumeProducer = { module: previewModule, name: "consume" } satisfies ProducerRef;
export const previewManifest: ModuleManifest = {
  ...emptyManifest(previewModule.name),
  dependencies: [{
    module: laboratory,
  }],
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
  const surfaces = new MarkupSurfaceRegistry();
  surfaces.registerStructured({
    module: laboratory,
    declaration: resultSurface,
    handler: ({ element }) => {
      const id = element.attributes.id;
      if (typeof id !== "string") throw new Error("Result id is required");
      return {
        records: [],
        components: [{ id, fragment, inputs: {}, outputs: { result: `${id}.result` }, range: element.range }],
      };
    },
  });
  surfaces.registerStructured({
    module: assetLaboratory,
    declaration: assetSurface,
    handler: async ({ element, resolveAsset }) => {
    const id = element.attributes.id;
    const src = element.attributes.src;
    if (typeof id !== "string" || typeof src !== "string") throw new Error("Asset id and src are required");
    const resolved = await resolveAsset({
      from: src,
      mediaType: "application/octet-stream",
      ...(src === "package:example.asset-lab/embedded.bin"
        ? { bytes: new Uint8Array([8, 6, 7, 5, 3, 0, 9]) }
        : {}),
      range: element.range,
    });
    return {
      records: [{ id, type: assetType, value: resolved.blob, range: element.range }],
      components: [],
    };
    },
  });
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupAuthorFrontend({
    registry: surfaces,
    resolveModule(request): ModuleRef {
      const resolved = modules.resolve(request.from);
      if (resolved === undefined) throw new Error(`unknown module ${request.from}`);
      return resolved;
    },
  }));
  return new Compiler({
    modules,
    frontends,
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
          return { blob: { ...blob } };
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
