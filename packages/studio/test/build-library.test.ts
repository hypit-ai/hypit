import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { BuildResultRepository } from "@hypit/build-result";
import type { BuildView } from "@hypit/runtime-host-node";

import { openStudioBuildLibrary, readStudioLibrary } from "../src/build-library.js";

function activeBuild(id: string, root: string): BuildView {
  return {
    id,
    createdAt: 100,
    activity: "saving-result",
    outcome: "complete",
    cancellationRequested: false,
    source: { path: `${root}/author/main.svml` },
    run: { path: `${root}/runs/build.svrun` },
    targets: ["final.video"],
    acceptedRecords: 1,
    outstandingCommands: 0,
    operations: [],
  };
}

test("Studio library joins this environment's Builds with project Build Result files", async () => {
  const relevant = activeBuild("bld_20260902T130000000Z_0000000001", "/project");
  const unrelated = activeBuild("bld_20260902T130000001Z_0000000001", "/another-project");
  const manifests = [relevant, unrelated].map((entry) => ({
    format: "hypit.build-result@2" as const,
    id: entry.id,
    source: entry.source!,
    ...(entry.run === undefined ? {} : { run: entry.run }),
    targets: ["final.video"],
    finishedAt: entry.createdAt,
    outcome: "complete" as const,
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
    async remove() {},
    async updatePresentation() { throw new Error("read-only fixture"); },
    async read(build) { return manifests.find((item) => item.id === build); },
    async browse() { return { results: manifests }; },
    async describeOutput(build, output) {
      const manifest = manifests.find((item) => item.id === build);
      const value = manifest?.outputs[output as "final.video"];
      return value === undefined ? undefined : {
        type: value.type,
        kind: "resource",
        size: value.value.size,
        mediaType: value.value.mediaType,
      };
    },
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
      async activity() {
        return { builds: [relevant, unrelated], capacity: [] };
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
    id: "bld_20260902T130000000Z_0000000001",
    status: "active",
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
    build: "bld_20260902T130000000Z_0000000001",
    output: "final.video",
    valuePath: "$",
    filePath: "files/final.video.mp4",
    mediaType: "video/mp4",
  }]);
});

test("Studio opens project Build Results without a Runtime or ResourceStore", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-studio-results-"));
  const build = "bld_20260902T130000002Z_0000000001";
  const directory = join(root, ".hypit", "results", build);
  const bytes = new TextEncoder().encode("finished-video");
  try {
    await mkdir(join(directory, "files"), { recursive: true });
    await writeFile(join(directory, "files", "final.mp4"), bytes);
    await writeFile(join(directory, "result.json"), `${JSON.stringify({
      format: "hypit.build-result@2",
      title: "First cut",
      source: { path: join(root, "main.svml") },
      run: { path: join(root, "build.svrun") },
      targets: ["final.video"],
      finishedAt: 200,
      outcome: "complete",
      outputs: {
        "final.video": {
          type: { module: { name: "example", version: "1" }, name: "Video" },
          value: { kind: "build-file", path: "files/final.mp4", size: bytes.byteLength, mediaType: "video/mp4" },
        },
      },
    }, null, 2)}\n`, "utf8");

    const buildLibrary = await openStudioBuildLibrary(undefined, root, root);
    assert(buildLibrary !== undefined);
    const view = await buildLibrary.library();
    assert.equal(view.runtime, undefined);
    assert.deepEqual(view.tasks.map((item) => [item.id, item.title, item.status]), [
      [build, "First cut", "complete"],
    ]);
    assert.deepEqual(view.artifacts.map((item) => [item.build, item.output, item.valuePath]), [
      [build, "final.video", "$"],
    ]);
    const artifact = await buildLibrary.openArtifact(build, "final.video", "$");
    assert.notEqual(artifact, undefined);
    const stream = await artifact!.open({ start: 2, endExclusive: 8 });
    assert.notEqual(stream, undefined);
    const opened: number[] = [];
    for await (const chunk of stream!) opened.push(...chunk);
    assert.deepEqual(Uint8Array.from(opened), bytes.slice(2, 8));
    const record = await buildLibrary.resolveHistoricalOutput(build, "final.video");
    assert.equal(record?.value.kind, "blob");
    assert.equal(record?.attachments?.length, 1);
    await buildLibrary.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
