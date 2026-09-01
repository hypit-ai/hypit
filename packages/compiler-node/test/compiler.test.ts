import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ModulePackageRegistry,
  NodeCompiler,
  NodeCompilerError,
  NodeRunCompiler,
} from "@hypit/compiler-node";
import {
  AuthorFrontendRegistry,
  sealGraphFragment,
} from "@hypit/elaborator";
import type {
  AuthorSourceAssetRequest,
  AuthorSourceImport,
  AuthorSourceUnit,
} from "@hypit/elaborator";
import type {
  BlobRef,
  ModuleManifest,
  ModuleRef,
  ProducerRef,
  TypeRef,
} from "@hypit/protocol";
import { SourceHeaderError } from "@hypit/source";
import {
  RunFragmentRegistry,
  RunFrontendRegistry,
} from "@hypit/run";
import { runMarkupFrontend } from "@hypit/run-markup";
import type { ArtifactAttachment, Workspace } from "@hypit/workspace";
import { WorkspaceError } from "@hypit/workspace";
import {
  createMarkupAuthorFrontend,
  MarkupSurfaceRegistry,
} from "@hypit/markup";
import { NodeFilesystemWorkspace } from "@hypit/workspace-fs-node";

function emptyManifest(name: string, version = "1"): ModuleManifest {
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

test("registered module imports close transitive module dependencies", () => {
  const base = emptyManifest("example.base");
  const feature: ModuleManifest = {
    ...emptyManifest("example.feature"),
    dependencies: [{
      module: { name: base.name, version: base.version },
    }],
  };
  const modules = new ModulePackageRegistry();
  modules.register({ manifest: base });
  modules.register({ manifest: feature, specifiers: ["example.feature@stable"] });

  assert.deepEqual(modules.resolve("example.feature@stable"), { name: feature.name, version: feature.version });
  assert.deepEqual(
    modules.createClosure(["example.feature@stable"]).modules.map((item) => item.manifest.name).sort(),
    ["example.base", "example.feature"],
  );
});

test("module registration is atomic", () => {
  const first = emptyManifest("example.first");
  const second = emptyManifest("example.second");
  const modules = new ModulePackageRegistry();
  modules.register({ manifest: first, specifiers: ["example.shared@1"] });
  assert.throws(
    () => modules.register({ manifest: second, specifiers: ["example.shared@1"] }),
    (error: unknown) => error instanceof NodeCompilerError && error.code === "DUPLICATE_MODULE_SPECIFIER",
  );
  assert.equal(modules.resolve("example.second@1"), undefined);

});

const laboratory = { name: "example.compiler-lab", version: "1" } as const;
const resultType = { module: laboratory, name: "Result" } satisfies TypeRef;
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
    outputs: [{ name: "result", type: resultType }],
    needs: [],
  }],
};
const fragment = sealGraphFragment({
  inputs: [],
  operations: [{
    id: "produce",
    producer,
    inputs: {},
    result: { kind: "output", name: "result" },
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

function compiler(
  root: string,
  additional: readonly ModuleManifest[] = [],
  onDiscover?: () => void,
): NodeCompiler {
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
        fragment: fragment.id,
        inputs: {},
        outputs: { result: `${id}.result` },
        range: element.range,
      }],
      fragments: [fragment],
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
  return new NodeCompiler({ modules, frontends, workspace: new NodeFilesystemWorkspace({ root }) });
}

const previewModule = { name: "example.compiler-preview", version: "1" } as const;
const previewProducer = { module: previewModule, name: "preview" } satisfies ProducerRef;
const previewManifest: ModuleManifest = {
  ...emptyManifest(previewModule.name),
  dependencies: [{
    module: laboratory,
  }],
  producers: [{
    name: previewProducer.name,
    inputs: [],
    outputs: [{ name: "result", type: resultType }],
    needs: [],
  }],
};
const previewFragment = sealGraphFragment({
  inputs: [],
  operations: [{
    id: "preview",
    producer: previewProducer,
    inputs: {},
    result: { kind: "output", name: "result" },
  }],
  exports: [{
    name: "result",
    type: resultType,
    root: { kind: "fragment-operation", operation: "preview" },
  }],
});

function assetCompiler(environment: { readonly root: string } | { readonly workspace: Workspace }): NodeCompiler {
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
        components: [{ id, fragment: fragment.id, inputs: {}, outputs: { result: `${id}.result` }, range: element.range }],
        fragments: [fragment],
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
      records: [{ id, type: assetType, value: resolved.artifact, range: element.range }],
      components: [],
      fragments: [],
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
  return new NodeCompiler({
    modules,
    frontends,
    workspace: "workspace" in environment
      ? environment.workspace
      : new NodeFilesystemWorkspace({ root: environment.root }),
  });
}

function memoryWorkspace(sourceText: string, assetBytes: Uint8Array): Workspace {
  return {
    async open(entryLocator) {
      const entry: AuthorSourceUnit = { id: entryLocator, name: "main.svml", text: sourceText };
      let attachment: { readonly artifact: BlobRef; readonly open: () => AsyncIterable<Uint8Array> } | undefined;
      return {
        entry,
        async resolveSource(_importer: AuthorSourceUnit, request: AuthorSourceImport) {
          throw new WorkspaceError("UNKNOWN_MEMORY_SOURCE", `No memory source satisfies ${request.from}`, request.from);
        },
        async resolveAsset(importer: AuthorSourceUnit, request: AuthorSourceAssetRequest) {
          if (importer !== entry || request.from !== "./reference.bin") {
            throw new WorkspaceError("UNKNOWN_MEMORY_ASSET", `No memory asset satisfies ${request.from}`, request.from);
          }
          const bytes = Uint8Array.from(assetBytes);
          const artifact: BlobRef = {
            kind: "blob",
            resource: "res_memory-reference",
            size: bytes.byteLength,
            mediaType: request.mediaType,
          };
          attachment = { artifact, open: async function* () { yield Uint8Array.from(bytes); } };
          return { artifact: { ...artifact } };
        },
        attachments() {
          return attachment === undefined
            ? []
            : [{ artifact: { ...attachment.artifact }, open: attachment.open }];
        },
      };
    },
  };
}

async function readAttachment(attachment: ArtifactAttachment | undefined): Promise<Uint8Array | undefined> {
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

test("Node Compiler discovers real imports and emits a named public Author Graph export", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-compiler-node-"));
  const file = join(root, "main.svml");
  await writeFile(file, `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="lab" from="example.compiler-lab@1"/>
    <lab:Result id="hello"/>
  </svml>`, "utf8");

  let discoveries = 0;
  const compiled = await compiler(root, [], () => { discoveries += 1; }).compileFile(file);
  assert.equal(compiled.exports[0]?.name, "hello.result");
  assert.equal(compiled.graph.outputs.length, 1);
  assert.equal(discoveries, 1, "the frozen Import Prologue must not execute Frontend discovery twice");

});

test("the mandatory Source Header selects the Frontend independently of the filename suffix", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-self-described-source-"));
  const text = `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="lab" from="example.compiler-lab@1"/>
    <lab:Result id="hello"/>
  </svml>`;
  const svml = join(root, "main.svml");
  const arbitrary = join(root, "main.anything");
  await writeFile(svml, text, "utf8");
  await writeFile(arbitrary, text, "utf8");
  const first = await compiler(root).compileFile(svml);
  const second = await compiler(root).compileFile(arbitrary);
  assert.equal(first.exports[0]?.name, "hello.result");
  assert.equal(second.exports[0]?.name, "hello.result");

  const missing = join(root, "missing.svml");
  await writeFile(missing, "<svml/>", "utf8");
  await assert.rejects(
    compiler(root).compileFile(missing),
    (error: unknown) => error instanceof SourceHeaderError && error.code === "SOURCE_HEADER_MISSING",
  );
});

test("Run-only Fragment modules extend the execution closure without polluting the Author Graph", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-dual-graph-closure-"));
  const unused = emptyManifest("example.unused-video-feature");
  const authorFile = join(root, "main.svml");
  const runFile = join(root, "build.svrun");
  await writeFile(authorFile, `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="lab" from="example.compiler-lab@1"/>
    <import as="unused" from="example.unused-video-feature@1"/>
    <lab:Result id="hello"/>
  </svml>`, "utf8");
  await writeFile(runFile, `<?svml using="@hypit/run-markup@1"?>
  <svrun version="1">
    <author source="./main.svml"/>
    <import from="@example/preview" as="preview"/>
    <target output="hello.result"/>
    <fragment id="one" using="preview:result"/>
    <satisfy output="hello.result" candidate="one.result"/>
  </svrun>`, "utf8");

  const authorCompiler = compiler(root, [previewManifest, unused]);
  const frontends = new RunFrontendRegistry();
  frontends.register(runMarkupFrontend);
  const fragments = new RunFragmentRegistry();
  fragments.register({ name: "@example/preview", fragments: { result: previewFragment } });
  const runCompiler = new NodeRunCompiler({ authorCompiler, frontends, fragments });
  const compiled = await runCompiler.compileFile(runFile);
  const planned = runCompiler.planCompilation(compiled);

  assert.deepEqual(
    compiled.author.program.closure.modules.map((item) => item.manifest.name),
    [laboratory.name, unused.name],
  );
  assert.deepEqual(
    compiled.program.closure.modules.map((item) => item.manifest.name).sort(),
    [laboratory.name, previewModule.name, unused.name].sort(),
  );
  assert.deepEqual(
    planned.state.program.closure.modules.map((item) => item.manifest.name).sort(),
    [laboratory.name, previewModule.name].sort(),
    "the durable Build keeps only modules needed by its selected execution slice",
  );
  assert.equal(planned.definition.plan, planned.state.plan);
  assert.equal(planned.definition.request, planned.state.request);
  assert.equal(planned.definition.plan.steps.length, 1);
  assert.equal(planned.definition.plan.steps[0]?.producer.name, previewProducer.name);
});

test("static Run checking accepts a future BuildRecord without opening a BuildArchive", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-future-build-record-"));
  const authorFile = join(root, "main.svml");
  const runFile = join(root, "reuse.svrun");
  await writeFile(authorFile, `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="lab" from="example.compiler-lab@1"/>
    <lab:Result id="hello"/>
  </svml>`, "utf8");
  await writeFile(runFile, `<?svml using="@hypit/run-markup@1"?>
  <svrun version="1">
    <author source="./main.svml"/>
    <target output="hello.result"/>
    <build-record id="prior" build="future-build" output="hello.result"/>
    <satisfy output="hello.result" candidate="prior"/>
  </svrun>`, "utf8");
  const authorCompiler = compiler(root);
  const frontends = new RunFrontendRegistry();
  frontends.register(runMarkupFrontend);
  const runCompiler = new NodeRunCompiler({
    authorCompiler,
    frontends,
    fragments: new RunFragmentRegistry(),
  });
  const workspace = await new NodeFilesystemWorkspace({ root }).open(runFile);
  const checked = await runCompiler.checkSource(workspace.entry, workspace);
  assert.deepEqual(checked.unresolvedBuildRecords, [{
    id: "prior",
    build: "future-build",
    output: "hello.result",
  }]);
  await assert.rejects(
    runCompiler.compileSource(workspace.entry, workspace),
    /plan\/build requires --runtime to resolve it/u,
  );
});

test("source assets become graph values and a Host transfer bundle without closure metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-source-assets-"));
  const file = join(root, "main.svml");
  const asset = join(root, "reference.bin");
  await writeFile(file, `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="asset" from="example.asset-lab@1"/>
    <asset:Asset id="reference" src="./reference.bin"/>
  </svml>`, "utf8");
  await writeFile(asset, new Uint8Array([1, 2, 3, 4]));

  const first = await assetCompiler({ root }).compileFile(file);
  const attachment = first.attachments[0];
  assert.deepEqual(await readAttachment(attachment), new Uint8Array([1, 2, 3, 4]));
  assert.equal(first.program.records[0]?.value.kind, "blob");
  assert.equal(first.program.records[0]?.value.kind === "blob" ? first.program.records[0].value.resource : undefined, attachment?.artifact.resource);
  await writeFile(asset, new Uint8Array([9, 8, 7]));
  const second = await assetCompiler({ root }).compileFile(file);
  assert.notEqual(second.attachments[0]?.artifact.resource, attachment?.artifact.resource);
});

test("an installed package Surface can contribute embedded bytes without an author file or network", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-embedded-assets-"));
  const file = join(root, "main.svml");
  await writeFile(file, `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="asset" from="example.asset-lab@1"/>
    <asset:Asset id="embedded" src="package:example.asset-lab/embedded.bin"/>
  </svml>`, "utf8");

  const compiled = await assetCompiler({ root }).compileFile(file);
  const attachment = compiled.attachments[0];
  assert.deepEqual(await readAttachment(attachment), new Uint8Array([8, 6, 7, 5, 3, 0, 9]));
  assert.equal(compiled.program.records[0]?.value.kind, "blob");
  assert.equal(compiled.program.records[0]?.value.kind === "blob"
    ? compiled.program.records[0].value.resource
    : undefined, attachment?.artifact.resource);
});

test("Run compilation retains embedded Author attachments for later Runtime staging", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-run-author-attachments-"));
  const authorFile = join(root, "main.svml");
  const runFile = join(root, "build.svrun");
  await writeFile(authorFile, `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="asset" from="example.asset-lab@1"/>
    <import as="lab" from="example.compiler-lab@1"/>
    <asset:Asset id="embedded" src="package:example.asset-lab/embedded.bin"/>
    <lab:Result id="hello"/>
  </svml>`, "utf8");
  await writeFile(runFile, `<?svml using="@hypit/run-markup@1"?>
  <svrun version="1">
    <author source="./main.svml"/>
    <target output="hello.result"/>
  </svrun>`, "utf8");

  const authorCompiler = assetCompiler({ root });
  const frontends = new RunFrontendRegistry();
  frontends.register(runMarkupFrontend);
  const runCompiler = new NodeRunCompiler({
    authorCompiler,
    frontends,
    fragments: new RunFragmentRegistry(),
  });
  const compiled = await runCompiler.compileFile(runFile);
  assert.deepEqual(compiled.attachments.map((item) => item.artifact), compiled.author.attachments.map((item) => item.artifact));
  assert.deepEqual(await readAttachment(compiled.attachments[0]), new Uint8Array([8, 6, 7, 5, 3, 0, 9]));
});

test("filesystem Workspace captures source text and asset identity once", async () => {
  const parent = await mkdtemp(join(tmpdir(), "hypit-source-host-"));
  const root = join(parent, "project");
  await mkdir(root);
  const entryPath = join(root, "main.svml");
  const includedPath = join(root, "included.svs");
  const outsidePath = join(parent, "outside.svs");
  const assetPath = join(root, "asset.bin");
  await writeFile(entryPath, "first", "utf8");
  await writeFile(includedPath, "included-first", "utf8");
  await writeFile(outsidePath, "outside", "utf8");
  await writeFile(assetPath, new Uint8Array([1, 2, 3]));
  await symlink(outsidePath, join(root, "escaped.svs"));
  const workspace = await new NodeFilesystemWorkspace({ root }).open(entryPath);
  const entry = workspace.entry;
  await writeFile(entryPath, "second", "utf8");
  assert.equal((await new NodeFilesystemWorkspace({ root }).open(entryPath)).entry.text, "second");
  assert.equal(entry.text, "first");
  assert.equal(await readFile(entryPath, "utf8"), "second");
  const sourceRequest = { from: "./included.svs", alias: "included" };
  const firstIncluded = await workspace.resolveSource(entry, sourceRequest);
  await writeFile(includedPath, "included-second", "utf8");
  assert.deepEqual(await workspace.resolveSource(entry, sourceRequest), firstIncluded);
  assert.equal(firstIncluded.text, "included-first");
  const firstAsset = await workspace.resolveAsset(entry, { from: "./asset.bin", mediaType: "application/octet-stream" });
  await writeFile(assetPath, new Uint8Array([4, 5, 6, 7]));
  const capturedAsset = await workspace.resolveAsset(entry, { from: "./asset.bin", mediaType: "application/octet-stream" });
  assert.deepEqual(capturedAsset, firstAsset, "one Workspace keeps an asset edge bound to the first bytes read");
  const detached = await workspace.attachments();
  assert.deepEqual(await readAttachment(detached[0]), new Uint8Array([4, 5, 6, 7]),
    "attachment bytes are opened lazily; Runtime rejects them if they no longer match the captured identity");
  assert.equal((await workspace.attachments())[0]?.artifact.resource, firstAsset.artifact.resource);
  await assert.rejects(
    async () => await workspace.resolveSource(entry, {
      from: "./escaped.svs",
      alias: "escaped",
    }),
    (error: unknown) => error instanceof WorkspaceError && error.code === "SOURCE_OUTSIDE_ROOT",
  );
  await assert.rejects(
    async () => await workspace.resolveAsset(entry, {
      from: "./escaped.svs",
      mediaType: "application/octet-stream",
    }),
    (error: unknown) => error instanceof WorkspaceError && error.code === "SOURCE_ASSET_OUTSIDE_ROOT",
  );
});

test("an asset root widens bytes without widening Source imports", async () => {
  const parent = await mkdtemp(join(tmpdir(), "hypit-asset-root-"));
  const project = join(parent, "project");
  const library = join(parent, "library");
  await mkdir(project);
  await mkdir(library);
  const entryPath = join(project, "main.svml");
  const assetPath = join(library, "shared.bin");
  const sourcePath = join(library, "shared.svs");
  await writeFile(entryPath, "entry", "utf8");
  await writeFile(assetPath, new Uint8Array([2, 7, 1, 8]));
  await writeFile(sourcePath, "shared source", "utf8");
  const workspace = await new NodeFilesystemWorkspace({ root: project, assetRoots: [library] }).open(entryPath);
  assert.equal((await workspace.resolveAsset(workspace.entry, {
    from: "../library/shared.bin",
    mediaType: "application/octet-stream",
  })).artifact.size, 4);
  await assert.rejects(async () => await workspace.resolveSource(workspace.entry, {
    from: "../library/shared.svs",
    alias: "shared",
  }), (error: unknown) => error instanceof WorkspaceError && error.code === "SOURCE_OUTSIDE_ROOT");
});

test("filesystem and in-memory Workspaces load identical asset bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-workspace-equivalence-"));
  const file = join(root, "main.svml");
  const source = `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="asset" from="example.asset-lab@1"/>
    <asset:Asset id="reference" src="./reference.bin"/>
  </svml>`;
  const bytes = new Uint8Array([3, 1, 4, 1, 5]);
  await writeFile(file, source, "utf8");
  await writeFile(join(root, "reference.bin"), bytes);

  const filesystem = await assetCompiler({ root }).compileFile(file);
  const memory = await assetCompiler({ workspace: memoryWorkspace(source, bytes) }).compileFile("memory:main");

  const memoryArtifact = memory.attachments[0]?.artifact;
  const filesystemArtifact = filesystem.attachments[0]?.artifact;
  assert.ok(memoryArtifact?.resource);
  assert.ok(filesystemArtifact?.resource);
  assert.notEqual(memoryArtifact.resource, filesystemArtifact.resource,
    "separate admissions keep separate resource identities even for equal bytes");
  assert.deepEqual(
    { size: memoryArtifact.size, mediaType: memoryArtifact.mediaType },
    { size: filesystemArtifact.size, mediaType: filesystemArtifact.mediaType },
  );
  assert.deepEqual(await readAttachment(memory.attachments[0]),
    await readAttachment(filesystem.attachments[0]));
});
