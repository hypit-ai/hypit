import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { commandHint } from "../../src/command-hint.js";
import test from "node:test";

import {
  fileReferenceIdentity,
  FileBuildResult,
  FileBuildResultRepository,
  ownedFileReference,
} from "@hypit/result/node";
import { ModulePackageRegistry, Compiler } from "@hypit/compiler";
import {
  AuthorDeclarationRegistry,
  AuthorFrontendRegistry,
  declarationField,
  sealGraphFragment,
  type AuthorDeclarationCompiler,
} from "@hypit/author";
import { createMarkupDeclarationAuthorFrontend, MarkupDeclarationRegistry } from "@hypit/markup";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, TypedRecord } from "@hypit/protocol";
import { runMarkupFrontend } from "@hypit/markup/run";
import { NodeFilesystemWorkspace } from "@hypit/workspace/node";

import type { CliDistribution } from "../../src/distribution.js";
import { cliDistribution } from "../distribution-scenario.js";
import { createCatalogDescriptor } from "../../src/build-planning.js";
import { runCli } from "../../src/main.js";
import { loadRunFile, resolveBuildResultValue } from "../../src/run-file.js";
import type { BuildResultValueRepository } from "../../src/run-file.js";

import {
  completedRecords,
  fixture,
  generationCapability,
  humanCommand,
  jsonCommand,
  publication,
  resultDistribution,
  valueType,
} from "./build-result-scenario.js";

test("build-record selects one exact Result Output without leaking its storage address into Core", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-result-reuse-"));
  try {
    const module = { name: "example.result-reuse", version: "1" } as const;
    const videoType = { module, name: "Video" } satisfies TypeRef;
    const producer = { module, name: "make-video" } satisfies ProducerRef;
    const manifest: ModuleManifest = {
      format: "hypit.module@1",
      name: module.name,
      version: module.version,
      dependencies: [],
      types: [videoType.name],
      capabilities: [],
      producers: [{
        name: producer.name,
        inputs: [],
        result: { kind: "output" as const, name: "video", type: videoType },
      }],
    };
    const fragment = sealGraphFragment({
      inputs: [],
      operations: [{
        id: "make-video",
        producer,
        inputs: {},
        result: { kind: "output" as const, name: "video" },
      }],
      exports: [{
        name: "video",
        type: videoType,
        root: { kind: "fragment-operation", operation: "make-video" },
      }],
    });
    const modules = new ModulePackageRegistry();
    modules.register({ manifest });
    const declarations = new AuthorDeclarationRegistry();
    declarations.register({
      module,
      declaration: "video",
      outputs: [videoType],
      shape: {
        summary: "Produces one test Video.",
        fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the Video." }],
      },
      bindings(declaration) {
        const id = declarationField(declaration, "id");
        if (id?.kind !== "literal") throw new Error("Video id is required");
        return [{ name: `${id.value}.video`, ref: { kind: "component-output", component: id.value, output: "video" }, type: videoType }];
      },
      compile({ declaration }) {
        const id = declarationField(declaration, "id");
        if (id?.kind !== "literal") throw new Error("Video id is required");
        return { records: [], components: [{ id: id.value, fragment, inputs: {}, outputs: { video: `${id.value}.video` }, range: declaration.range }] };
      },
    } satisfies AuthorDeclarationCompiler);
    const syntax = new MarkupDeclarationRegistry();
    syntax.register({ module, declaration: "video", tag: "Video" });
    const authorFrontends = new AuthorFrontendRegistry();
    authorFrontends.register(createMarkupDeclarationAuthorFrontend({
      syntax,
      compilers: declarations,
      resolveModule(request) {
        const resolved = modules.resolve(request.from);
        if (resolved === undefined) throw new Error(`unknown module ${request.from}`);
        return resolved;
      },
    }));
    const authorCompiler = new Compiler({
      modules,
      frontends: authorFrontends,
      workspace: new NodeFilesystemWorkspace({ root }),
    });

    const resultsRoot = join(root, ".hypit", "results");
    const result = await FileBuildResult.create(resultsRoot, {
      id: "bld_20260902T110000001Z_0000000001",
      sourceId: join(root, "main.svml"),
      runId: join(root, "prior.svrun"),
      publication: publication([{ name: "shot.video", output: "logical:video", type: videoType }], ["shot.video"]),
    });
    const bytes = new TextEncoder().encode("prior video bytes");
    await result.sync({
      records: [{
          id: "record:video",
          type: videoType,
          value: ({ artifact: {
            kind: "blob",
            resource: "res_prior_video",
            size: bytes.byteLength,
            mediaType: "video/mp4",
          } }),
        }],
      resources: {
        async open() {
          return (async function* () { yield bytes; })();
        },
      },
    });
    await result.finish({ outcome: "complete" });

    const authorFile = join(root, "main.svml");
    const runFile = join(root, "reuse.svrun");
    await writeFile(authorFile, `<?svml using="@hypit/markup@1"?>
<svml>
  <import as="media" from="example.result-reuse@1"/>
  <media:Video id="shot"/>
</svml>`, "utf8");
    await writeFile(runFile, `<?svml using="@hypit/markup/run@1"?>
<svrun version="1">
  <author source="./main.svml"/>
  <target output="shot.video"/>
  <build-record id="prior" build="bld_20260902T110000001Z_0000000001" output="shot.video"/>
  <satisfy output="shot.video" candidate="prior"/>
</svrun>`, "utf8");

    const workspace = await authorCompiler.openEntry(runFile);
    const repository = new FileBuildResultRepository(resultsRoot);
    let opens = 0;
    let resolves = 0;
    const countedRepository: FileBuildResultRepository = Object.create(repository) as FileBuildResultRepository;
    countedRepository.resolve = async (build, output) => {
      resolves += 1;
      return await repository.resolve(build, output);
    };
    countedRepository.openFile = async (build, file) => {
      opens += 1;
      return await repository.openFile(build, file);
    };
    const loaded = await loadRunFile({
      workspace,
      authorCompiler,
      frontends: [runMarkupFrontend],
      packageContributions: [],
      results: countedRepository,
    });
    const forwardedBuild = loaded.compiler.prepareCompilation(loaded);
    const catalog = createCatalogDescriptor({ source: authorFile, publication: forwardedBuild.publication });
    assert.equal(catalog.publication.outputs.find((output) => output.name === "shot.video")?.displayName, "shot");
    const renamed = createCatalogDescriptor({ source: authorFile, publication: {
      outputs: forwardedBuild.publication.outputs.map((output) => ({ ...output, name: `public.${output.name}` })),
    } });
    assert.equal(renamed.publication.outputs.find((output) => output.name === "public.shot.video")?.displayName, "shot");
    const candidate = loaded.run.graph.candidates[0];
    assert.deepEqual(candidate?.root, { kind: "supply", record: "record:run:source:prior" });
    assert.deepEqual(loaded.materializedSupplies, [],
      "a forward-only Candidate remains structural and is never materialized into Core");
    const logicalOutput = loaded.author.exports.find((item) => item.name === "shot.video")?.ref;
    assert.equal(logicalOutput?.kind, "logical-output");
    const forwarded = forwardedBuild.publication.outputs.find((output) => output.output === logicalOutput!.id);
    assert.deepEqual(forwarded?.type, videoType);
    assert.deepEqual(forwarded?.source, {
      kind: "historical-output",
      build: "bld_20260902T110000001Z_0000000001",
      output: "shot.video",
    });
    assert.equal(resolves, 0, "forward-only compilation never opens the historical value document");
    assert.equal(loaded.attachments.length, 0);
    assert.deepEqual(loaded.resultResourceReferences, {});
    assert.equal(forwardedBuild.state.plan.steps.length, 0);
    assert.equal(forwardedBuild.state.status, "complete");
    assert.deepEqual(forwardedBuild.definition.plan.goals, []);
    assert.equal(opens, 0);

    const materializeImport = async (base: typeof loaded, build: string): Promise<typeof loaded> => {
      const [resolved, stored] = await Promise.all([
        resolveBuildResultValue(repository, build, "shot.video"),
        repository.resolve(build, "shot.video"),
      ]);
      assert(resolved !== undefined);
      assert(stored?.value.kind === "value");
      if (stored?.value.kind !== "value") throw new Error("expected value document");
      const files = new Map<string, typeof stored.value.document.resources[number]["file"]>();
      for (const binding of stored.value.document.resources) {
        files.set(fileReferenceIdentity(stored.build, binding.file), binding.file);
      }
      const references = Object.fromEntries((resolved.attachments ?? []).map((attachment, index) => {
        const file = [...files.values()][index];
        if (file === undefined) throw new Error("resolved attachment has no Result file");
        return [attachment.blob.resource, ownedFileReference(stored.build, file)];
      }));
      const candidate = base.run.graph.candidates[0];
      if (candidate?.root.kind !== "supply") throw new Error("expected supply declaration");
      return {
        ...base,
        materializedSupplies: [{ id: candidate.root.record, type: candidate.type, value: resolved.value }],
        attachments: resolved.attachments ?? [],
        resultResourceReferences: references,
      };
    };

    // New structured records may wrap imported values at arbitrary depth. Their Resource ownership
    // must survive multiple Builds, including a mix of old media and newly produced bytes.
    let imported = await materializeImport(loaded, "bld_20260902T110000001Z_0000000001");
    const owner = "bld_20260902T110000001Z_0000000001";
    for (const id of ["bld_20260902T110000002Z_0000000001", "bld_20260902T110000003Z_0000000001"]) {
      const rootValue = imported.materializedSupplies[0]?.value;
      if (rootValue === undefined) throw new Error("expected materialized supply");
      const extra = { kind: "blob" as const, resource: `res_${id}`, size: 1, mediaType: "image/png" };
      const current = await repository.create({
        id, sourceId: authorFile,
        publication: publication([{ name: "shot.video", output: "wrapped", record: "record:wrapped", type: videoType }], ["shot.video"]),
        resourceReferences: imported.resultResourceReferences,
      });
      await current.sync({
        records: [{ id: "record:wrapped", type: videoType,
          value: ({ layers: [{ nested: rootValue }], extra }) }],
        resources: { async open(artifact) {
          assert.equal(artifact.resource, extra.resource, "Only genuinely new bytes may be copied");
          return (async function* () { yield new Uint8Array([7]); })();
        } },
      });
      await current.finish({ outcome: "complete" });
      assert.deepEqual(await readdir(join(current.directory, "files")), ["file-0001.png"]);
      const saved = await repository.resolve(id, "shot.video");
      assert.equal(saved?.value.kind, "value");
      if (saved?.value.kind !== "value") throw new Error("expected value document");
      const original = saved.value.document.resources.find((binding) => binding.file.mediaType === "video/mp4")!;
      assert.deepEqual(original.file, { kind: "build-file", build: owner, path: "files/file-0001.mp4", size: bytes.length, mediaType: "video/mp4" });
      const received: number[] = [];
      for await (const chunk of (await repository.openFile(id, original.file))!) received.push(...chunk);
      assert.deepEqual(Uint8Array.from(received), bytes);
      await writeFile(runFile, (await readFile(runFile, "utf8")).replace(/build="[^"]+"/, `build="${id}"`));
      imported = await materializeImport(await loadRunFile({ workspace: await authorCompiler.openEntry(runFile), authorCompiler,
        frontends: [runMarkupFrontend], packageContributions: [], results: repository }), id);
    }

    // Explicit export collects a standalone bundle, including same-named files with different owners.
    const bundle = join(root, "exported-layout");
    await jsonCommand(["get", "bld_20260902T110000003Z_0000000001", "--output", "shot.video", "--to", bundle], root);
    const exported = JSON.parse(await readFile(join(bundle, "value.json"), "utf8")) as import("@hypit/result").BuildResultValueDocument;
    assert.equal(exported.resources.length, 3);
    const exportedPaths = new Set<string>();
    for (const binding of exported.resources) {
      assert.equal(binding.file.kind, "build-file");
      if (binding.file.kind !== "build-file") throw new Error("expected local export");
      assert.equal(binding.file.build, undefined);
      exportedPaths.add(binding.file.path);
      assert.deepEqual(await readFile(join(bundle, binding.file.path)),
        binding.file.mediaType === "video/mp4" ? Buffer.from(bytes) : Buffer.from([7]));
    }
    assert.equal(exportedPaths.size, 3);

    // A file Candidate is a live address, even when republished by separate Builds.
    const externalPath = join(root, "selected.mp4");
    await writeFile(externalPath, bytes);
    await writeFile(runFile, `<?svml using="@hypit/markup/run@1"?>
<svrun version="1"><author source="./main.svml"/><target output="shot.video"/>
<file id="selected" type="example.result-reuse@1#Video" from="./selected.mp4" media-type="video/mp4"/>
<satisfy output="shot.video" candidate="selected"/></svrun>`);
    const externalRun = await loadRunFile({ workspace: await authorCompiler.openEntry(runFile), authorCompiler,
      frontends: [runMarkupFrontend], packageContributions: [], results: repository });
    assert.deepEqual(Object.values(externalRun.resultResourceReferences), [{
      kind: "external-file", uri: pathToFileURL(await realpath(externalPath)).href, size: bytes.length, mediaType: "video/mp4",
    }]);
    const preparedExternal = externalRun.compiler.prepareCompilation(externalRun);
    for (const id of ["bld_20260902T110000004Z_0000000001", "bld_20260902T110000005Z_0000000001"]) {
      const current = await repository.create({ id, sourceId: authorFile,
        publication: preparedExternal.publication,
        resourceReferences: externalRun.resultResourceReferences });
      await current.sync({ records: preparedExternal.state.records,
        resources: { async open() { throw new Error("External files must stay references"); } } });
      await current.finish({ outcome: "complete" });
      assert.deepEqual(await readdir(current.directory), ["result.json"]);
    }
    const externalBuild = "bld_20260902T110000005Z_0000000001";
    await writeFile(externalPath, "replacement");
    const changed = await repository.resolve(externalBuild, "shot.video");
    assert.equal(changed?.value.kind, "external-file");
    if (changed?.value.kind !== "external-file") throw new Error("expected file");
    assert.equal(changed.value.size, 11);
    const chunks: Uint8Array[] = [];
    for await (const chunk of (await repository.openFile(externalBuild, changed.value))!) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), "replacement");
    await rm(externalPath);
    await assert.rejects(repository.resolve(externalBuild, "shot.video"), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Result value-document resources rebuild each shared container once", async () => {
  const count = 400;
  let visited = 0;
  class CountedArray extends Array<null> {
    override map<U>(callback: (value: null, index: number, array: null[]) => U, thisArg?: unknown): U[] {
      visited += this.length;
      return super.map(callback, thisArg);
    }
  }
  const value = new CountedArray(count).fill(null);
  const file = { kind: "build-file" as const, path: "files/one.mp4", size: 1, mediaType: "video/mp4" };
  const repository: BuildResultValueRepository = {
    read: async (build) => ({
      format: "hypit.build-result@1" as const,
      id: build,
      sourceId: "main.svml",
      targets: [],
      outputs: {},
      outcome: "complete" as const,
      finishedAt: 1,
    }),
    resolve: async () => ({ build: "owner", output: "structured", type: valueType, value: {
      kind: "value" as const,
      path: "values/value-0001.json",
      document: {
        format: "hypit.result-value@1" as const,
        value,
        resources: Array.from({ length: count }, (_, index) => ({ at: [index], file })),
      },
    } }),
    describeFile: async () => file,
    openFile: async () => undefined,
  };
  const resolved = await resolveBuildResultValue(repository, "owner", "structured");
  assert.equal(visited, count, "the root array is rebuilt once rather than once per Resource binding");
  assert.equal(resolved?.attachments?.length, 1, "one historical file identity remains one lazy attachment");
});
