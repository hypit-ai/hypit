import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileBuildResult, FileBuildResultRepository } from "@hypit/build-result";
import { ModulePackageRegistry, NodeCompiler } from "@hypit/compiler-node";
import { AuthorFrontendRegistry, sealGraphFragment } from "@hypit/elaborator";
import { createMarkupAuthorFrontend, MarkupSurfaceRegistry } from "@hypit/markup";
import type { BuildState, ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { runMarkupFrontend } from "@hypit/run-markup";
import { NodeFilesystemWorkspace } from "@hypit/workspace-fs-node";

import type { CliDistribution } from "../src/distribution.js";
import { runCli } from "../src/main.js";
import { loadRunFile } from "../src/run-file.js";

const valueType: TypeRef = {
  module: { name: "example.result", version: "1" },
  name: "Value",
};

function completedState(): BuildState {
  return {
    status: "complete",
    records: [{ id: "record:stage", type: valueType, value: { kind: "inline", value: "ready" } }],
    plan: {
      outputBindings: [{ output: "logical:stage", record: "record:stage", type: valueType }],
    },
  } as unknown as BuildState;
}

async function fixture(root: string): Promise<void> {
  const result = await FileBuildResult.create(join(root, ".hypit", "results"), {
    id: "bld_20260902T110000000Z_0000000001",
    title: "episode-stage",
    source: { path: join(root, "main.svml") },
    run: { path: join(root, "build.svrun") },
    targets: ["stage.value"],
    publishedOutputs: [{ name: "stage.value", output: "logical:stage" }],
  });
  await result.sync({
    state: completedState(),
    resources: { async open() { throw new Error("inline Result has no files"); } },
  });
  await result.finish({ outcome: "complete" });
}

async function jsonCommand(args: readonly string[], root: string): Promise<unknown> {
  let output = "";
  await runCli([...args, "--workspace", root, "--json"], {
    write(text) { output += text; },
  }, {} as CliDistribution);
  return JSON.parse(output);
}

test("builds, history, inspect and get read project Build Results without opening a Runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-results-"));
  try {
    await fixture(root);
    const builds = await jsonCommand(["builds"], root) as {
      readonly builds: readonly {
        readonly build: string;
        readonly title?: string;
        readonly outcome: string;
        readonly outputs: readonly string[];
      }[];
    };
    assert.equal(builds.builds.length, 1);
    assert.equal(builds.builds[0]?.build, "bld_20260902T110000000Z_0000000001");
    assert.equal(builds.builds[0]?.title, "episode-stage");
    assert.equal(builds.builds[0]?.outcome, "complete");
    assert.deepEqual(builds.builds[0]?.outputs, ["stage.value"]);

    const history = await jsonCommand(["history", "stage.value"], root) as {
      readonly entries: readonly { readonly build: string; readonly output: { readonly name: string } }[];
    };
    assert.equal(history.entries.length, 1);
    assert.equal(history.entries[0]?.build, "bld_20260902T110000000Z_0000000001");
    assert.equal(history.entries[0]?.output.name, "stage.value");

    const inspected = await jsonCommand(["inspect", "bld_20260902T110000000Z_0000000001"], root) as {
      readonly result: { readonly id: string; readonly title?: string };
    };
    assert.equal(inspected.result.id, "bld_20260902T110000000Z_0000000001");
    assert.equal(inspected.result.title, "episode-stage");

    const destination = join(root, "exported.json");
    const exported = await jsonCommand([
      "get", "bld_20260902T110000000Z_0000000001", "--output", "stage.value", "--to", destination,
    ], root);
    assert.deepEqual(exported, {
      format: "hypit.cli-get@3",
      build: "bld_20260902T110000000Z_0000000001",
      output: "stage.value",
      type: valueType,
      kind: "scalar",
      path: destination,
    });
    assert.equal(await readFile(destination, "utf8"), "\"ready\"\n");
    await assert.rejects(
      jsonCommand(["get", "bld_20260902T110000000Z_0000000001", "--output", "stage.value", "--to", destination], root),
      /Export destination .* already exists/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("get exports Resource bytes and a self-contained Composite directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-get-"));
  const build = "bld_20260902T110000010Z_0000000001";
  const videoType = { module: { name: "example.media", version: "1" }, name: "Video" } satisfies TypeRef;
  const takeType = { module: { name: "example.speech", version: "1" }, name: "SemanticTake" } satisfies TypeRef;
  const bytes = new TextEncoder().encode("video bytes");
  const video = {
    kind: "blob",
    resource: "res_video",
    size: bytes.byteLength,
    mediaType: "video/mp4",
  } as const;
  try {
    const result = await FileBuildResult.create(join(root, ".hypit", "results"), {
      id: build,
      source: { path: join(root, "main.svml") },
      targets: ["final.video"],
      publishedOutputs: [
        { name: "final.video", output: "logical:video" },
        { name: "final.take", output: "logical:take" },
      ],
    });
    await result.sync({
      state: {
        status: "complete",
        records: [
          { id: "record:video", type: videoType, value: video },
          {
            id: "record:take",
            type: takeType,
            value: { kind: "inline", value: { words: ["hello"], media: { artifact: video } } },
          },
        ],
        plan: { outputBindings: [
          { output: "logical:video", record: "record:video", type: videoType },
          { output: "logical:take", record: "record:take", type: takeType },
        ] },
      } as unknown as BuildState,
      resources: {
        async open() { return (async function* () { yield bytes; })(); },
      },
    });
    await result.finish({ outcome: "complete" });

    const resourceDestination = join(root, "output", "final.mp4");
    const resource = await jsonCommand([
      "get", build, "--output", "final.video", "--to", resourceDestination,
    ], root) as { readonly kind: string; readonly build: string; readonly output: string };
    assert.equal(resource.kind, "resource");
    assert.equal(resource.build, build);
    assert.equal(resource.output, "final.video");
    assert.equal(new TextDecoder().decode(await readFile(resourceDestination)), "video bytes");

    const compositeDestination = join(root, "output", "final-take");
    const composite = await jsonCommand([
      "get", build, "--output", "final.take", "--to", compositeDestination,
    ], root) as { readonly kind: string; readonly path: string };
    assert.equal(composite.kind, "composite");
    assert.equal(composite.path, compositeDestination);
    assert.equal((await stat(compositeDestination)).isDirectory(), true);
    const document = JSON.parse(await readFile(join(compositeDestination, "value.json"), "utf8")) as {
      readonly format: string;
      readonly value: { readonly words: readonly string[]; readonly media: { readonly artifact: null } };
      readonly resources: readonly [{ readonly file: { readonly path: string } }];
    };
    assert.equal(document.format, "hypit.result-value@1");
    assert.deepEqual(document.value.words, ["hello"]);
    assert.equal(document.value.media.artifact, null);
    assert.equal(
      new TextDecoder().decode(await readFile(join(compositeDestination, document.resources[0].file.path))),
      "video bytes",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("get requires an exact Output name and an explicit destination", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-get-options-"));
  try {
    const silent = { write() {} };
    await assert.rejects(
      runCli(["get", "bld_20260902T110000000Z_0000000001", "--workspace", root], silent, {} as CliDistribution),
      /get requires --output/u,
    );
    await assert.rejects(
      runCli([
        "get", "bld_20260902T110000000Z_0000000001", "--output", "stage.value", "--workspace", root,
      ], silent, {} as CliDistribution),
      /get requires --to/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("result edit changes only the exact project Result presentation without opening a Runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-result-edit-"));
  try {
    await fixture(root);
    const edited = await jsonCommand([
      "result", "edit", "bld_20260902T110000000Z_0000000001",
      "--title", "Episode 12 B-roll",
      "--note", "Use the close-up for the opening beat.",
      "--highlight", "stage.value",
      "--highlight", "stage.value",
    ], root) as {
      readonly build: string;
      readonly title: string;
      readonly note: string;
      readonly highlightedOutputs: readonly string[];
    };
    assert.deepEqual(edited, {
      format: "hypit.cli-result-edit@2",
      build: "bld_20260902T110000000Z_0000000001",
      title: "Episode 12 B-roll",
      note: "Use the close-up for the opening beat.",
      highlightedOutputs: ["stage.value"],
    });

    const repository = new FileBuildResultRepository(join(root, ".hypit", "results"));
    const stored = await repository.read("bld_20260902T110000000Z_0000000001");
    assert.equal(stored?.title, "Episode 12 B-roll");
    assert.equal(stored?.note, "Use the close-up for the opening beat.");
    assert.deepEqual(stored?.highlightedOutputs, ["stage.value"]);

    const cleared = await jsonCommand([
      "result", "edit", "bld_20260902T110000000Z_0000000001", "--clear-title", "--clear-note", "--clear-highlights",
    ], root) as {
      readonly title: null;
      readonly note: null;
      readonly highlightedOutputs: readonly string[];
    };
    assert.equal(cleared.title, null);
    assert.equal(cleared.note, null);
    assert.deepEqual(cleared.highlightedOutputs, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
      types: [{ name: videoType.name }],
      capabilities: [],
      producers: [{
        name: producer.name,
        inputs: [],
        outputs: [{ name: "video", type: videoType }],
        needs: [],
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
    const modules = new ModulePackageRegistry();
    modules.register({ manifest });
    const surfaces = new MarkupSurfaceRegistry();
    surfaces.registerStructured({
      module,
      declaration: { name: "video", tag: "Video", mode: "structured", outputs: [] },
      handler: ({ element }) => {
        const id = element.attributes.id;
        if (typeof id !== "string") throw new Error("Video id is required");
        return {
          records: [],
          components: [{ id, fragment: fragment.id, inputs: {}, outputs: { video: `${id}.video` }, range: element.range }],
          fragments: [fragment],
        };
      },
    });
    const authorFrontends = new AuthorFrontendRegistry();
    authorFrontends.register(createMarkupAuthorFrontend({
      registry: surfaces,
      resolveModule(request) {
        const resolved = modules.resolve(request.from);
        if (resolved === undefined) throw new Error(`unknown module ${request.from}`);
        return resolved;
      },
    }));
    const authorCompiler = new NodeCompiler({
      modules,
      frontends: authorFrontends,
      workspace: new NodeFilesystemWorkspace({ root }),
    });

    const resultsRoot = join(root, ".hypit", "results");
    const result = await FileBuildResult.create(resultsRoot, {
      id: "bld_20260902T110000001Z_0000000001",
      source: { path: join(root, "main.svml") },
      run: { path: join(root, "prior.svrun") },
      targets: ["shot.video"],
      publishedOutputs: [{ name: "shot.video", output: "logical:video" }],
    });
    const bytes = new TextEncoder().encode("prior video bytes");
    await result.sync({
      state: {
        status: "complete",
        records: [{
          id: "record:video",
          type: videoType,
          value: { kind: "inline", value: { artifact: {
            kind: "blob",
            resource: "res_prior_video",
            size: bytes.byteLength,
            mediaType: "video/mp4",
          } } },
        }],
        plan: { outputBindings: [{ output: "logical:video", record: "record:video", type: videoType }] },
      } as unknown as BuildState,
      resources: {
        async open() {
          return (async function* () { yield bytes; })();
        },
      },
    });

    const authorFile = join(root, "main.svml");
    const runFile = join(root, "reuse.svrun");
    await writeFile(authorFile, `<?svml using="@hypit/markup@1"?>
<svml>
  <import as="media" from="example.result-reuse@1"/>
  <media:Video id="shot"/>
</svml>`, "utf8");
    await writeFile(runFile, `<?svml using="@hypit/run-markup@1"?>
<svrun version="1">
  <author source="./main.svml"/>
  <target output="shot.video"/>
  <build-record id="prior" build="bld_20260902T110000001Z_0000000001" output="shot.video"/>
  <satisfy output="shot.video" candidate="prior"/>
</svrun>`, "utf8");

    const workspace = await authorCompiler.openFile(runFile);
    const repository = new FileBuildResultRepository(resultsRoot);
    let opens = 0;
    const countedRepository: FileBuildResultRepository = Object.create(repository) as FileBuildResultRepository;
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
    const candidate = loaded.run.graph.candidates[0];
    assert.equal(candidate?.root.kind, "value");
    const value = candidate?.root.kind === "value" ? candidate.root.value.value : undefined;
    assert.equal(value?.kind, "inline");
    assert.equal(value?.kind === "inline"
      ? (value.value as { readonly artifact?: { readonly kind?: string } }).artifact?.kind
      : undefined, "blob");
    const logicalOutput = loaded.author.exports.find((item) => item.name === "shot.video")?.ref;
    assert.equal(logicalOutput?.kind, "logical-output");
    assert.deepEqual(loaded.compiler.planCompilation(loaded).resultForwards, [{
      output: logicalOutput!.id,
      build: "bld_20260902T110000001Z_0000000001",
      sourceOutput: "shot.video",
    }]);
    assert.equal(loaded.attachments.length, 1);
    assert.equal(opens, 0, "compilation does not read or summarize historical bytes");
    const reused: number[] = [];
    for await (const chunk of await loaded.attachments[0]!.open()) reused.push(...chunk);
    assert.deepEqual(Uint8Array.from(reused), bytes);
    assert.equal(opens, 1, "Runtime staging opens the historical Result exactly once");
    assert.equal(loaded.compiler.planCompilation(loaded).state.plan.steps.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
