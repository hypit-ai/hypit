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
  NodeSourceHost,
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
  ModuleManifest,
  ModuleRef,
  ProducerRef,
  TypeRef,
} from "@svml/protocol";
import {
  createTextAuthorFrontend,
  TextSurfaceRegistry,
  textAuthorFrontendId,
} from "@svml/text";

function emptyManifest(name: string, version = "1"): ModuleManifest {
  return {
    format: "svml.module@0",
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
  format: "svml.module@0",
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

function compiler(root: string): NodeCompiler {
  const modules = new ModulePackageRegistry();
  modules.register({ manifest: laboratoryManifest });
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
  return new NodeCompiler({ modules, frontends, entryFrontend: textAuthorFrontendId, root });
}

function assetCompiler(root: string): NodeCompiler {
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
  return new NodeCompiler({ modules, frontends, entryFrontend: textAuthorFrontendId, root });
}

test("Node Compiler discovers real imports and plans a named public export", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-compiler-node-"));
  const file = join(root, "main.svml");
  await writeFile(file, `<svml>
    <import as="lab" from="example.compiler-lab@1"/>
    <lab:Result id="hello"/>
  </svml>`, "utf8");

  const compiled = await compiler(root).compileFile(file);
  assert.equal(compiled.exports[0]?.name, "hello.result");
  assert.equal(compiled.elaboration.graph.outputs.length, 1);

  const planned = await compiler(root).planFile(file, { targets: ["hello.result"] });
  assert.equal(planned.plan.steps.length, 1);
  assert.equal(planned.plan.steps[0]?.producer.name, "produce");
  assert.equal(planned.plan.goals.length, 1);
});

test("source assets are content addressed, closure-bound and returned as a Host transfer bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-source-assets-"));
  const file = join(root, "main.svml");
  const asset = join(root, "reference.bin");
  await writeFile(file, `<svml>
    <import as="asset" from="example.asset-lab@1"/>
    <asset:Asset id="reference" src="./reference.bin"/>
  </svml>`, "utf8");
  await writeFile(asset, new Uint8Array([1, 2, 3, 4]));

  const first = await assetCompiler(root).compileFile(file);
  const unit = first.closure.units.find((item) => item.assets.length > 0);
  const attachment = first.sourceArtifacts[0];
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
  const second = await assetCompiler(root).compileFile(file);
  assert.notEqual(second.closure.id, first.closure.id);
  assert.notEqual(second.sourceArtifacts[0]?.artifact.digest, attachment?.artifact.digest);
});

test("Node Source Host contains symlinks and reads each canonical source only once", async () => {
  const parent = await mkdtemp(join(tmpdir(), "svml-source-host-"));
  const root = join(parent, "project");
  await mkdir(root);
  const entryPath = join(root, "main.svml");
  const outsidePath = join(parent, "outside.svs");
  const assetPath = join(root, "asset.bin");
  await writeFile(entryPath, "first", "utf8");
  await writeFile(outsidePath, "outside", "utf8");
  await writeFile(assetPath, new Uint8Array([1, 2, 3]));
  await symlink(outsidePath, join(root, "escaped.svs"));
  const host = await NodeSourceHost.create(root);
  const entry = await host.load(entryPath);
  await writeFile(entryPath, "second", "utf8");
  assert.equal((await host.load(entryPath)).text, "first");
  assert.equal(await readFile(entryPath, "utf8"), "second");
  const firstAsset = await host.resolveAsset(entry, { from: "./asset.bin", mediaType: "application/octet-stream" });
  await writeFile(assetPath, new Uint8Array([4, 5, 6, 7]));
  const lockedAsset = await host.resolveAsset(entry, { from: "./asset.bin", mediaType: "application/octet-stream" });
  assert.deepEqual(lockedAsset, firstAsset, "one Host locks an asset edge to the first bytes read");
  const detached = host.sourceArtifacts();
  detached[0]?.bytes.fill(0);
  assert.deepEqual(host.sourceArtifacts()[0]?.bytes, new Uint8Array([1, 2, 3]));
  await assert.rejects(
    async () => await host.resolveSource(entry, {
      from: "./escaped.svs",
      alias: "escaped",
      frontend: "example.frontend@1",
    }),
    (error: unknown) => error instanceof NodeCompilerError && error.code === "SOURCE_OUTSIDE_ROOT",
  );
  await assert.rejects(
    async () => await host.resolveAsset(entry, {
      from: "./escaped.svs",
      mediaType: "application/octet-stream",
    }),
    (error: unknown) => error instanceof NodeCompilerError && error.code === "SOURCE_ASSET_OUTSIDE_ROOT",
  );
});
