import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
} from "@svml/compiler-node";
import {
  computeModuleDigest,
  digestOf,
} from "@svml/core";
import {
  AuthorFrontendRegistry,
  sealGraphFragment,
  verifySourceClosure,
} from "@svml/elaborator";
import type {
  AuthorSourceAssetRequest,
  AuthorSourceImport,
  AuthorSourceUnit,
} from "@svml/elaborator";
import type {
  BlobRef,
  ModuleManifest,
  ModuleRef,
  ProducerRef,
  TypeRef,
} from "@svml/protocol";
import { SourceHeaderError } from "@svml/source";
import {
  RunFragmentRegistry,
  RunFrontendRegistry,
} from "@svml/run";
import { runTextFrontend } from "@svml/run-text";
import type { Workspace } from "@svml/host";
import { WorkspaceError } from "@svml/host";
import {
  createTextAuthorFrontend,
  TextSurfaceRegistry,
} from "@svml/text";
import { NodeFilesystemWorkspace } from "@svml/workspace-fs-node";

function emptyManifest(name: string, version = "1"): ModuleManifest {
  return {
    format: "svml.module@1",
    name,
    version,
    dependencies: [],
    types: [],
    capabilities: [],
    surfaces: [],
    producers: [],
  };
}

test("registered module imports close exact transitive manifest dependencies", () => {
  const base = emptyManifest("example.base");
  const feature: ModuleManifest = {
    ...emptyManifest("example.feature"),
    dependencies: [{
      module: { name: base.name, version: base.version },
      digest: computeModuleDigest(base),
    }],
  };
  const modules = new ModulePackageRegistry();
  modules.register({ manifest: base });
  modules.register({ manifest: feature, specifiers: ["example.feature@stable"] });

  assert.deepEqual(modules.resolve("example.feature@stable"), { name: feature.name, version: feature.version });
  assert.deepEqual(
    modules.createClosure(["example.feature@stable"]).modules.map((item) => item.ref.name).sort(),
    ["example.base", "example.feature"],
  );
});

test("module registration is atomic and dependency digests cannot drift", () => {
  const first = emptyManifest("example.first");
  const second = emptyManifest("example.second");
  const modules = new ModulePackageRegistry();
  modules.register({ manifest: first, specifiers: ["example.shared@1"] });
  assert.throws(
    () => modules.register({ manifest: second, specifiers: ["example.shared@1"] }),
    (error: unknown) => error instanceof NodeCompilerError && error.code === "DUPLICATE_MODULE_SPECIFIER",
  );
  assert.equal(modules.resolve("example.second@1"), undefined);

  const wrongDependency: ModuleManifest = {
    ...emptyManifest("example.wrong"),
    dependencies: [{
      module: { name: first.name, version: first.version },
      digest: digestOf("another implementation"),
    }],
  };
  modules.register({ manifest: wrongDependency });
  assert.throws(
    () => modules.createClosure(["example.wrong@1"]),
    (error: unknown) => error instanceof NodeCompilerError
      && error.code === "MODULE_DEPENDENCY_DIGEST_MISMATCH",
  );
});

const laboratory = { name: "example.compiler-lab", version: "1" } as const;
const resultType = { module: laboratory, name: "Result" } satisfies TypeRef;
const producer = { module: laboratory, name: "produce" } satisfies ProducerRef;
const surfaceDigest = digestOf("example.compiler-lab/surface@1");
const laboratoryManifest: ModuleManifest = {
  format: "svml.module@1",
  name: laboratory.name,
  version: laboratory.version,
  dependencies: [],
  types: [{ name: resultType.name, schema: { kind: "string", minLength: 1 } }],
  capabilities: [],
  surfaces: [{
    name: "result",
    tag: "Result",
    mode: "structured",
    outputs: [],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "example.compiler-lab/surface",
      digest: surfaceDigest,
    },
  }],
  producers: [{
    name: producer.name,
    inputs: [],
    outputs: [{ name: "result", type: resultType }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "example.compiler-lab/produce",
      digest: digestOf("example.compiler-lab/produce@1"),
    },
  }],
};
const fragment = sealGraphFragment({
  name: "example.compiler-lab/result@1",
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
    semanticInputs: [],
    fidelity: "exact",
  }],
});

const assetLaboratory = { name: "example.asset-lab", version: "1" } as const;
const assetType = { module: assetLaboratory, name: "Asset" } satisfies TypeRef;
const assetSurfaceDigest = digestOf("example.asset-lab/surface@1");
const assetManifest: ModuleManifest = {
  ...emptyManifest(assetLaboratory.name),
  types: [{ name: assetType.name, schema: { kind: "blob" } }],
  surfaces: [{
    name: "asset",
    tag: "Asset",
    mode: "structured",
    outputs: [assetType],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "example.asset-lab/surface",
      digest: assetSurfaceDigest,
    },
  }],
};

function compiler(root: string, additional: readonly ModuleManifest[] = []): NodeCompiler {
  const modules = new ModulePackageRegistry();
  modules.register({ manifest: laboratoryManifest });
  for (const manifest of additional) modules.register({ manifest });
  const surfaces = new TextSurfaceRegistry();
  surfaces.registerStructured(laboratory, "result", surfaceDigest, ({ element }) => {
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
  });
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createTextAuthorFrontend({
    registry: surfaces,
    resolveModule(request): ModuleRef {
      const resolved = modules.resolve(request.from);
      if (resolved === undefined) throw new Error(`unknown module ${request.from}`);
      return resolved;
    },
  }));
  return new NodeCompiler({ modules, frontends, root });
}

const previewModule = { name: "example.compiler-preview", version: "1" } as const;
const previewProducer = { module: previewModule, name: "preview" } satisfies ProducerRef;
const previewManifest: ModuleManifest = {
  ...emptyManifest(previewModule.name),
  dependencies: [{
    module: laboratory,
    digest: computeModuleDigest(laboratoryManifest),
  }],
  producers: [{
    name: previewProducer.name,
    inputs: [],
    outputs: [{ name: "result", type: resultType }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "example.compiler-preview/preview",
      digest: digestOf("example.compiler-preview/preview@1"),
    },
  }],
};
const previewFragment = sealGraphFragment({
  name: "example.compiler-preview/preview@1",
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
    semanticInputs: [],
    fidelity: "substitute",
  }],
});

function assetCompiler(environment: { readonly root: string } | { readonly workspace: Workspace }): NodeCompiler {
  const modules = new ModulePackageRegistry();
  modules.register({ manifest: assetManifest });
  const surfaces = new TextSurfaceRegistry();
  surfaces.registerStructured(assetLaboratory, "asset", assetSurfaceDigest, async ({ element, resolveAsset }) => {
    const id = element.attributes.id;
    const src = element.attributes.src;
    if (typeof id !== "string" || typeof src !== "string") throw new Error("Asset id and src are required");
    const resolved = await resolveAsset({ from: src, mediaType: "application/octet-stream", range: element.range });
    return {
      records: [{ id, type: assetType, value: resolved.artifact, range: element.range }],
      components: [],
      fragments: [],
    };
  });
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createTextAuthorFrontend({
    registry: surfaces,
    resolveModule(request): ModuleRef {
      const resolved = modules.resolve(request.from);
      if (resolved === undefined) throw new Error(`unknown module ${request.from}`);
      return resolved;
    },
  }));
  return new NodeCompiler({ modules, frontends, ...environment });
}

function memoryWorkspace(sourceText: string, assetBytes: Uint8Array): Workspace {
  return {
    async open(entryLocator) {
      const entry: AuthorSourceUnit = { id: entryLocator, name: "main.svml", text: sourceText };
      let attachment: { readonly artifact: BlobRef; readonly bytes: Uint8Array } | undefined;
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
            digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
            size: bytes.byteLength,
            mediaType: request.mediaType,
          };
          attachment = { artifact, bytes };
          return { artifact: { ...artifact } };
        },
        attachments() {
          return attachment === undefined
            ? []
            : [{ artifact: { ...attachment.artifact }, bytes: Uint8Array.from(attachment.bytes) }];
        },
      };
    },
  };
}

test("Node Compiler discovers real imports and emits a named public Author Graph export", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-compiler-node-"));
  const file = join(root, "main.svml");
  await writeFile(file, `<?svml using="@svml/text@1"?>
  <svml>
    <import as="lab" from="example.compiler-lab@1"/>
    <lab:Result id="hello"/>
  </svml>`, "utf8");

  const compiled = await compiler(root).compileFile(file);
  assert.equal(compiled.exports[0]?.name, "hello.result");
  assert.equal(compiled.elaboration.graph.outputs.length, 1);

});

test("Author Frontend identity comes only from the mandatory Source Header, never the suffix", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-self-described-source-"));
  const text = `<?svml using="@svml/text@1"?>
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
  assert.equal(first.closure.id, second.closure.id);
  assert.equal(first.elaboration.graph.id, second.elaboration.graph.id);

  const missing = join(root, "missing.svml");
  await writeFile(missing, "<svml/>", "utf8");
  await assert.rejects(
    compiler(root).compileFile(missing),
    (error: unknown) => error instanceof SourceHeaderError && error.code === "SOURCE_HEADER_MISSING",
  );
});

test("Run-only Fragment modules extend the execution closure without polluting the Author Graph", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-dual-graph-closure-"));
  const authorFile = join(root, "main.svml");
  const runFile = join(root, "build.svrun");
  await writeFile(authorFile, `<?svml using="@svml/text@1"?>
  <svml>
    <import as="lab" from="example.compiler-lab@1"/>
    <lab:Result id="hello"/>
  </svml>`, "utf8");
  await writeFile(runFile, `<?svml using="@svml/run-text@1"?>
  <svrun version="1" targets="preview">
    <author source="./main.svml"/>
    <import from="@example/preview" as="preview"/>
    <target-set id="preview"><target output="hello.result" accepts="substitute"/></target-set>
    <fragment id="one" using="preview:result"/>
    <satisfy output="hello.result" candidate="one.result" fidelity="substitute"/>
  </svrun>`, "utf8");

  const authorCompiler = compiler(root, [previewManifest]);
  const frontends = new RunFrontendRegistry();
  frontends.register(runTextFrontend);
  const fragments = new RunFragmentRegistry();
  fragments.register({ name: "@example/preview", fragments: { result: previewFragment } });
  const runCompiler = new NodeRunCompiler({ authorCompiler, frontends, fragments, root });
  const compiled = await runCompiler.compileFile(runFile);
  const planned = runCompiler.planCompilation(compiled);

  assert.deepEqual(
    compiled.author.program.closure.modules.map((item) => item.ref.name),
    [laboratory.name],
  );
  assert.deepEqual(
    compiled.program.closure.modules.map((item) => item.ref.name).sort(),
    [laboratory.name, previewModule.name].sort(),
  );
  assert.equal(compiled.run.graph.authorGraph, compiled.author.elaboration.graph.id);
  assert.equal(planned.plan.steps.length, 1);
  assert.equal(planned.plan.steps[0]?.producer.name, previewProducer.name);
});

test("source assets are content addressed, closure-bound and returned as a Host transfer bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-source-assets-"));
  const file = join(root, "main.svml");
  const asset = join(root, "reference.bin");
  await writeFile(file, `<?svml using="@svml/text@1"?>
  <svml>
    <import as="asset" from="example.asset-lab@1"/>
    <asset:Asset id="reference" src="./reference.bin"/>
  </svml>`, "utf8");
  await writeFile(asset, new Uint8Array([1, 2, 3, 4]));

  const first = await assetCompiler({ root }).compileFile(file);
  const unit = first.closure.units.find((item) => item.assets.length > 0);
  const attachment = first.attachments[0];
  assert.equal(unit?.assets[0]?.from, "./reference.bin");
  assert.equal(unit?.assets[0]?.artifact.digest, attachment?.artifact.digest);
  assert.deepEqual(attachment?.bytes, new Uint8Array([1, 2, 3, 4]));
  assert.equal(first.module.records[0]?.value.kind, "blob");
  assert.equal(first.module.records[0]?.value.kind === "blob" ? first.module.records[0].value.digest : undefined, attachment?.artifact.digest);
  const tamperedUnit = first.closure.units.map((item) => item === unit
    ? {
        ...item,
        assets: item.assets.map((sourceAsset) => ({
          ...sourceAsset,
          artifact: { ...sourceAsset.artifact, size: sourceAsset.artifact.size + 1 },
        })),
      }
    : item);
  assert.throws(
    () => verifySourceClosure({ ...first.closure, units: tamperedUnit }),
    /digest differs/u,
  );

  await writeFile(asset, new Uint8Array([9, 8, 7]));
  const second = await assetCompiler({ root }).compileFile(file);
  assert.notEqual(second.closure.id, first.closure.id);
  assert.notEqual(second.attachments[0]?.artifact.digest, attachment?.artifact.digest);
});

test("filesystem Workspace contains symlinks and reads each canonical source only once", async () => {
  const parent = await mkdtemp(join(tmpdir(), "svml-source-host-"));
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
  const lockedAsset = await workspace.resolveAsset(entry, { from: "./asset.bin", mediaType: "application/octet-stream" });
  assert.deepEqual(lockedAsset, firstAsset, "one Host locks an asset edge to the first bytes read");
  const detached = await workspace.attachments();
  detached[0]?.bytes.fill(0);
  assert.deepEqual((await workspace.attachments())[0]?.bytes, new Uint8Array([1, 2, 3]));
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

test("filesystem and in-memory Workspaces compile identical source and bytes to one semantic result", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-workspace-equivalence-"));
  const file = join(root, "main.svml");
  const source = `<?svml using="@svml/text@1"?>
  <svml>
    <import as="asset" from="example.asset-lab@1"/>
    <asset:Asset id="reference" src="./reference.bin"/>
  </svml>`;
  const bytes = new Uint8Array([3, 1, 4, 1, 5]);
  await writeFile(file, source, "utf8");
  await writeFile(join(root, "reference.bin"), bytes);

  const filesystem = await assetCompiler({ root }).compileFile(file);
  const memory = await assetCompiler({ workspace: memoryWorkspace(source, bytes) }).compileFile("memory:main");

  assert.equal(memory.closure.id, filesystem.closure.id);
  assert.equal(memory.module.semanticDigest, filesystem.module.semanticDigest);
  assert.equal(memory.elaboration.graph.id, filesystem.elaboration.graph.id);
  assert.deepEqual(memory.attachments, filesystem.attachments);
});
