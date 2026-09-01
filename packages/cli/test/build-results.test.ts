import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileBuildResult } from "@hypit/build-result";
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
      selections: [{ output: "logical:stage", candidate: "candidate:stage", record: "record:stage" }],
    },
  } as unknown as BuildState;
}

async function fixture(root: string): Promise<void> {
  const result = await FileBuildResult.create(join(root, ".hypit", "results"), {
    id: "bld_result",
    name: "episode-stage",
    source: { path: join(root, "main.svml") },
    run: { path: join(root, "build.svrun") },
    targets: ["final.video"],
    aliases: [{ name: "stage.value", output: "logical:stage" }],
  });
  await result.sync({
    state: completedState(),
    artifacts: { async open() { throw new Error("inline Result has no files"); } },
  });
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
        readonly name?: string;
        readonly status: string;
        readonly outputs: readonly string[];
      }[];
    };
    assert.equal(builds.builds.length, 1);
    assert.equal(builds.builds[0]?.build, "bld_result");
    assert.equal(builds.builds[0]?.name, "episode-stage");
    assert.equal(builds.builds[0]?.status, "complete");
    assert.deepEqual(builds.builds[0]?.outputs, ["stage.value"]);

    const history = await jsonCommand(["history", "stage.value"], root) as {
      readonly entries: readonly { readonly build: string; readonly output: { readonly name: string } }[];
    };
    assert.equal(history.entries.length, 1);
    assert.equal(history.entries[0]?.build, "bld_result");
    assert.equal(history.entries[0]?.output.name, "stage.value");

    const inspected = await jsonCommand(["inspect", "bld_result"], root) as {
      readonly result: { readonly id: string; readonly name?: string };
      readonly outputs: readonly { readonly name: string; readonly target: boolean }[];
    };
    assert.equal(inspected.result.id, "bld_result");
    assert.equal(inspected.result.name, "episode-stage");
    assert.deepEqual(inspected.outputs, [{
      name: "stage.value",
      target: false,
      type: valueType,
      value: { kind: "inline", value: "ready" },
    }]);

    const destination = join(root, "exported.json");
    await jsonCommand(["get", "bld_result", "--name", "stage.value", "--to", destination], root);
    assert.equal(await readFile(destination, "utf8"), "\"ready\"\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("build-record reads one exact result file and preserves its historical origin", async () => {
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
      id: "bld_prior",
      source: { path: join(root, "main.svml") },
      run: { path: join(root, "prior.svrun") },
      targets: ["shot.video"],
      aliases: [{ name: "shot.video", output: "logical:video" }],
    });
    const bytes = new TextEncoder().encode("prior video bytes");
    await result.sync({
      state: {
        status: "complete",
        records: [{
          id: "record:video",
          type: videoType,
          value: {
            kind: "blob",
            resource: "resource:prior-video",
            digest: "runtime-address:prior-video",
            size: bytes.byteLength,
            mediaType: "video/mp4",
          },
        }],
        plan: { selections: [{ output: "logical:video", candidate: "candidate:video", record: "record:video" }] },
      } as unknown as BuildState,
      artifacts: {
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
  <build-record id="prior" build="bld_prior" output="shot.video"/>
  <satisfy output="shot.video" candidate="prior"/>
</svrun>`, "utf8");

    const workspace = await authorCompiler.openFile(runFile);
    const loaded = await loadRunFile({
      workspace,
      authorCompiler,
      frontends: [runMarkupFrontend],
      packageContributions: [],
      resultsRoot,
    });
    const candidate = loaded.run.graph.candidates[0];
    assert.equal(candidate?.root.kind, "value");
    const value = candidate?.root.kind === "value" ? candidate.root.value.value : undefined;
    assert.equal(value?.kind, "blob");
    assert.deepEqual(value?.kind === "blob" ? value.origin : undefined, {
      kind: "build-file",
      build: "bld_prior",
      path: "files/shot.video.mp4",
    });
    assert.equal(loaded.attachments.length, 1);
    assert.equal(loaded.compiler.planCompilation(loaded).state.plan.steps.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
