import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { BuildState, ResourceId } from "@hypit/protocol";
import type { BuildResultRepository } from "@hypit/build-result";
import type { BuildCatalogEntry } from "@hypit/runtime";
import type { RuntimeHostStatus } from "@hypit/runtime-host-node";

import { openStudioArchive, readStudioLibrary } from "../src/archive.js";

const resource = "res_studio-archive" as ResourceId;

function state(): BuildState {
  return {
    format: "hypit.build@1",
    program: { closure: { format: "hypit.closure@1", modules: [] }, records: [] },
    graph: { format: "hypit.graph@1", outputs: [], candidates: [], operations: [] },
    request: { format: "hypit.build-request@1", targets: [{ output: "final-output" }] },
    plan: {
      format: "hypit.plan@1",
      steps: [],
      goals: [{ record: "final-record", type: { module: { name: "example", version: "1" }, name: "Video" } }],
      selections: [{ output: "final-output", candidate: "render", record: "final-record" }],
    },
    status: "complete",
    records: [{
      id: "final-record",
      type: { module: { name: "example", version: "1" }, name: "Video" },
      value: { kind: "blob", resource, size: 42, mediaType: "video/mp4" },
    }],
    steps: [],
    needs: [],
    outstanding: [],
    diagnostics: [],
  };
}

function catalog(build: string, root: string): BuildCatalogEntry {
  return {
    build,
    createdAt: 100,
    source: { path: `${root}/author/main.svml` },
    run: { path: `${root}/runs/build.svrun` },
    aliases: [{ name: "final.video", ref: { kind: "logical-output", id: "final-output" } }],
  };
}

test("Studio library joins this environment's Builds with project Build Result files", async () => {
  const relevant = catalog("build-inside", "/project");
  const unrelated = catalog("build-outside", "/another-project");
  const status: RuntimeHostStatus = {
    build: { build: relevant.build, definition: {} as never, facts: [], state: state() },
    catalog: relevant,
    operations: [],
    dispatch: {
      build: relevant.build,
      componentPackages: [],
      createdAt: 100,
      availableAt: 100,
      phase: "terminal",
      terminal: "complete",
    },
  };
  const manifests = [relevant, unrelated].map((entry) => ({
    format: "hypit.build-result@1" as const,
    id: entry.build,
    source: entry.source,
    ...(entry.run === undefined ? {} : { run: entry.run }),
    targets: ["final.video"],
    startedAt: entry.createdAt,
    updatedAt: entry.createdAt,
    finishedAt: entry.createdAt,
    status: "complete" as const,
    outputs: {
      "final.video": {
        type: { module: { name: "example", version: "1" }, name: "Video" },
        value: { kind: "build-file" as const, path: "files/final.video.mp4", size: 42, mediaType: "video/mp4" },
      },
    },
  }));
  const results: BuildResultRepository = {
    async create() { throw new Error("not used"); },
    async openWriter() { return undefined; },
    async read(build) { return manifests.find((item) => item.id === build); },
    async list() { return manifests; },
    async resolve(build, output) {
      const manifest = manifests.find((item) => item.id === build);
      const value = manifest?.outputs[output as "final.video"];
      return value === undefined ? undefined : { build, output, type: value.type, value: value.value };
    },
    async openFile() { return undefined; },
  };
  const view = await readStudioLibrary({
    profile: "/project/hypit.runtime.json",
    workspaceRoot: "/project",
    runtime: {
      async builds() { return [relevant, unrelated]; },
      async status(build) {
        assert.equal(build, relevant.build);
        return status;
      },
    },
    results,
  });

  assert.deepEqual(view.tasks.map((task) => ({
    id: task.id,
    status: task.status,
    source: task.source,
    run: task.run,
    targets: task.targets,
  })), [{
    id: "build-inside",
    status: "complete",
    source: "author/main.svml",
    run: "runs/build.svrun",
    targets: ["final.video"],
  }]);
  assert.deepEqual(view.artifacts.map((artifact) => ({
    build: artifact.build,
    output: artifact.output,
    valuePath: artifact.valuePath,
    filePath: artifact.filePath,
    mediaType: artifact.mediaType,
  })), [{
    build: "build-inside",
    output: "final.video",
    valuePath: "$",
    filePath: "files/final.video.mp4",
    mediaType: "video/mp4",
  }]);
});

test("Studio opens project Build Results without a Runtime or ResourceStore", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-studio-results-"));
  const directory = join(root, ".hypit", "results", "build-one");
  const bytes = new TextEncoder().encode("finished-video");
  try {
    await mkdir(join(directory, "files"), { recursive: true });
    await writeFile(join(directory, "files", "final.mp4"), bytes);
    await writeFile(join(directory, "result.json"), `${JSON.stringify({
      format: "hypit.build-result@1",
      id: "build-one",
      name: "First cut",
      source: { path: join(root, "main.svml") },
      run: { path: join(root, "build.svrun") },
      targets: ["final.video"],
      startedAt: 100,
      updatedAt: 200,
      finishedAt: 200,
      status: "complete",
      outputs: {
        "final.video": {
          type: { module: { name: "example", version: "1" }, name: "Video" },
          value: { kind: "build-file", path: "files/final.mp4", size: bytes.byteLength, mediaType: "video/mp4" },
        },
      },
    }, null, 2)}\n`, "utf8");

    const archive = await openStudioArchive(undefined, root, root);
    assert(archive !== undefined);
    const view = await archive.library();
    assert.equal(view.runtime, undefined);
    assert.deepEqual(view.artifacts.map((item) => [item.build, item.output, item.valuePath]), [
      ["build-one", "final.video", "$"],
    ]);
    assert.deepEqual((await archive.openArtifact("build-one", "final.video", "$"))?.bytes, bytes);
    const record = await archive.resolveBuildRecord("build-one", "final.video");
    assert.equal(record?.value.kind, "blob");
    assert.equal(record?.attachments?.length, 1);
    await archive.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
