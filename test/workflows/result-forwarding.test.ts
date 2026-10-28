import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  AuthorDeclarationRegistry,
  AuthorFrontendRegistry,
  declarationField,
  sealGraphFragment,
  type AuthorDeclarationCompiler,
} from "@hypit/hypit/author";
import { resolveBuildResultValue } from "@hypit/hypit/cli";
import { Compiler, ModulePackageRegistry, RunCompiler } from "@hypit/hypit/compiler";
import { EndpointRegistry, Executor, ProducerRegistry } from "@hypit/hypit/executor";
import { createMarkupDeclarationAuthorFrontend, MarkupDeclarationRegistry } from "@hypit/hypit/markup";
import { runMarkupFrontend } from "@hypit/hypit/markup/run";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { locateRepositoryBuildResultOutput, FileBuildResultRepository } from "@hypit/hypit/result/node";
import { RunFragmentRegistry, RunFrontendRegistry } from "@hypit/hypit/run";
import { InProcessBuildScheduler } from "@hypit/hypit/runtime";
import { NodeFilesystemWorkspace } from "@hypit/hypit/workspace/node";

const moduleRef = { name: "example.forwarding-workflow", version: "1" } as const;
const videoType = { module: moduleRef, name: "Video" } satisfies TypeRef;
const producer = { module: moduleRef, name: "make-video" } satisfies ProducerRef;

const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [videoType.name],
  capabilities: [],
  producers: [{
    name: producer.name,
    inputs: [],
    result: { kind: "output", name: "video", type: videoType },
  }],
};

const fragment = sealGraphFragment({
  inputs: [],
  operations: [{
    id: "make-video",
    producer,
    inputs: {},
    result: { kind: "output", name: "video" },
  }],
  exports: [{
    name: "video",
    type: videoType,
    root: { kind: "fragment-operation", operation: "make-video" },
  }],
});

function authorCompiler(root: string): Compiler {
  const modules = new ModulePackageRegistry();
  modules.register({ manifest });
  const declarations = new AuthorDeclarationRegistry();
  declarations.register({
    module: moduleRef,
    declaration: "video",
    outputs: [videoType],
    shape: {
      summary: "Produces one workflow Video.",
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
  syntax.register({ module: moduleRef, declaration: "video", tag: "Video" });
  const frontends = new AuthorFrontendRegistry();
  frontends.register(createMarkupDeclarationAuthorFrontend({
    syntax,
    compilers: declarations,
    resolveModule(request) {
      const resolved = modules.resolve(request.from);
      if (resolved === undefined) throw new Error(`unknown module ${request.from}`);
      return resolved;
    },
  }));
  return new Compiler({
    modules,
    frontends,
    workspace: new NodeFilesystemWorkspace({ root }),
  });
}

function currentPublication(record: string) {
  return { outputs: [{
    name: "shot.video",
    output: "logical:shot.video",
    displayName: "shot",
    type: videoType,
    target: true,
    source: { kind: "current-record" as const, record },
  }] };
}

test("a real Run forwards recursive Result value through the single scheduler without copying its Resources", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-forwarding-workflow-"));
  try {
    const resultsRoot = join(root, ".hypit", "results");
    const repository = new FileBuildResultRepository(resultsRoot);
    const priorId = "bld_20261020T010000001Z_0000000001";
    const currentId = "bld_20261020T010000002Z_0000000001";
    const sourceBlob = {
      kind: "blob" as const,
      resource: "res_source_video",
      size: 3,
      mediaType: "video/mp4",
    };
    const posterBlob = {
      kind: "blob" as const,
      resource: "res_poster_image",
      size: 2,
      mediaType: "image/png",
    };
    const bytes = new Map([
      [sourceBlob.resource, new Uint8Array([1, 2, 3])],
      [posterBlob.resource, new Uint8Array([4, 5])],
    ]);
    const prior = await repository.create({
      id: priorId,
      sourceId: join(root, "prior.svml"),
      runId: join(root, "prior.svrun"),
      publication: currentPublication("record:prior-video"),
    });
    await prior.sync({
      records: [{
        id: "record:prior-video",
        type: videoType,
        value: {
          layers: [{ source: sourceBlob }],
          presentation: { title: "Opening", poster: posterBlob },
        },
      }],
      resources: {
        async open(artifact) {
          const value = bytes.get(artifact.resource);
          if (value === undefined) throw new Error(`unknown Resource ${artifact.resource}`);
          return (async function* () { yield value; })();
        },
      },
    });
    await prior.finish({ outcome: "complete" });

    const authorFile = join(root, "main.svml");
    const runFile = join(root, "reuse.svrun");
    await writeFile(authorFile, `<?svml using="@hypit/markup@1"?>
<svml>
  <import as="media" from="example.forwarding-workflow@1"/>
  <media:Video id="shot"/>
</svml>`, "utf8");
    await writeFile(runFile, `<?svml using="@hypit/markup/run@1"?>
<svrun version="1">
  <author source="./main.svml"/>
  <target output="shot.video"/>
  <build-record id="prior" build="${priorId}" output="shot.video"/>
  <satisfy output="shot.video" candidate="prior"/>
</svrun>`, "utf8");

    const compiler = authorCompiler(root);
    const frontends = new RunFrontendRegistry();
    frontends.register(runMarkupFrontend);
    const runCompiler = new RunCompiler({
      authorCompiler: compiler,
      frontends,
      fragments: new RunFragmentRegistry(),
      locateHistoricalOutput: async (build, output) =>
        await locateRepositoryBuildResultOutput(repository, build, output),
      resolveHistoricalOutput: async (build, output) =>
        await resolveBuildResultValue(repository, build, output),
    });
    const workspace = await compiler.openEntry(runFile);
    const loaded = await runCompiler.compileResolvedSource(workspace.entry, workspace);
    const prepared = runCompiler.prepareCompilation(loaded);
    assert.deepEqual(loaded.materializedSupplies, [], "forward-only history remains a structural supply");
    assert.deepEqual(prepared.publication.outputs[0]?.source, {
      kind: "historical-output",
      build: priorId,
      output: "shot.video",
    });
    assert.equal(prepared.state.plan.steps.length, 0);

    const executor = new Executor({
      producers: new ProducerRegistry(),
      endpoints: new EndpointRegistry(),
    });
    const [scheduled] = await new InProcessBuildScheduler(executor).run([{
      id: currentId,
      definition: prepared.definition,
      facts: [],
    }]);
    assert.equal(scheduled?.status, "complete");
    assert.deepEqual(scheduled?.outcomes, []);

    const forwarded = await repository.create({
      id: currentId,
      sourceId: authorFile,
      runId: runFile,
      publication: prepared.publication,
    });
    await forwarded.sync({
      records: scheduled!.state.records,
      resources: { async open() { throw new Error("forwarding must not copy historical bytes"); } },
    });
    await forwarded.finish({ outcome: "complete" });

    assert.deepEqual(await readdir(forwarded.directory), ["result.json"]);
    const resolved = await repository.resolve(currentId, "shot.video");
    assert.equal(resolved?.build, priorId);
    assert.equal(resolved?.value.kind, "value");
    if (resolved?.value.kind !== "value") throw new Error("expected recursive Result value");
    assert.deepEqual(resolved.value.document.value, {
      layers: [{ source: null }],
      presentation: { poster: null, title: "Opening" },
    });
    assert.equal(resolved.value.document.resources.length, 2);
    const sourceFile = resolved.value.document.resources.find((item) => item.file.mediaType === "video/mp4")?.file;
    assert.ok(sourceFile !== undefined);
    const received: number[] = [];
    for await (const chunk of (await repository.openFile(resolved.build, sourceFile))!) received.push(...chunk);
    assert.deepEqual(received, [1, 2, 3]);

    const manifest = await repository.read(currentId);
    assert.equal(manifest?.outcome, "complete");
    assert.equal(manifest?.operations, undefined, "a Build with no executed operations publishes no operation entries");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
