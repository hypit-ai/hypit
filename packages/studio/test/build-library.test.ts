import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildResultDirectory, FileBuildResultStore } from "@hypit/result/runtime-storage/node";
import type { BuildResult, BuildResultHistory } from "@hypit/result";
import type { CliBuildView as BuildView } from "@hypit/cli";
import { buildIdCreatedAt } from "@hypit/protocol";
import { createVideoDistribution } from "@hypit/video";

import { openStudioBuildLibrary, readStudioLibrary } from "../src/build-library.js";

const videoDistribution = createVideoDistribution();

function activeBuild(id: string, root: string): BuildView {
  return {
    id,
    createdAt: buildIdCreatedAt(id)!,
    activity: "saving-result",
    outcome: "complete",

    sourcePath: `${root}/author/main.svml`,
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
    format: "hypit.build-result@1" as const,
    id: entry.id,
    sourcePath: entry.sourcePath!,
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
  const results: BuildResultHistory = {
    async read(build) { return manifests.find((item) => item.id === build); },
    async browse(request) {
      if (request?.before !== undefined) return { results: [] };
      assert.deepEqual(request, { limit: 25 });
      return { results: manifests, next: relevant.id };
    },
    async resolve(build, output) {
      const manifest = manifests.find((item) => item.id === build);
      const value = manifest?.outputs[output as "final.video"];
      return value === undefined ? undefined : { build, output, type: value.type, value: value.value };
    },
    async openFile() { return undefined; },
  };
  const input = {
    profile: "/project/hypit.runtime.json",
    workspaceRoot: "/project",
    runtime: {
      async activity() {
        return { builds: [relevant, unrelated], capacity: [] };
      },
    },
    results,
  };
  const view = await readStudioLibrary({ ...input, section: "tasks" });

  assert.equal(view.next, relevant.id);
  assert.deepEqual(view.tasks.map((task) => ({
    id: task.id,
    status: task.status,
    source: task.source,
    targets: task.targets,
  })), [{
    id: "bld_20260902T130000000Z_0000000001",
    status: "saving-result",
    source: "author/main.svml",
    targets: ["final.video"],
  }]);
  assert.deepEqual(view.artifacts, []);
  const media = await readStudioLibrary({ ...input, section: "artifacts" });
  assert.deepEqual(media.tasks, []);
  const queried: (string | undefined)[] = [];
  const images = await readStudioLibrary({ ...input, section: "artifacts", media: "image", results: {
    ...results,
    async browse(request) {
      queried.push(request?.before);
      if (request?.before === undefined) return { results: [manifests[0]!], next: relevant.id };
      return { results: [{ ...manifests[0]!, outputs: { "still.image": {
        ...manifests[0]!.outputs["final.video"],
        value: { kind: "build-file" as const, path: "files/still.png", size: 20, mediaType: "image/png" },
      } } }] };
    },
  } });
  assert.deepEqual(queried, [undefined, relevant.id]);
  assert.deepEqual(images.artifacts.map((item) => item.mediaType), ["image/png"]);
  assert.equal(images.next, undefined);

  assert.deepEqual(media.artifacts.map((artifact) => ({
    build: artifact.build,
    output: artifact.output,
    filePath: artifact.filePath,
    mediaType: artifact.mediaType,
  })), [{
    build: "bld_20260902T130000000Z_0000000001",
    output: "final.video",
    filePath: "files/final.video.mp4",
    mediaType: "video/mp4",
  }]);
});
test("Studio opens project Build Results without a Runtime or ResourceStore", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-studio-results-"));
  const build = "bld_20260902T130000002Z_0000000001";
  const directory = buildResultDirectory(join(root, ".hypit", "results"), build);
  const bytes = new TextEncoder().encode("finished-video");
  try {
    await mkdir(join(directory, "files"), { recursive: true });
    await writeFile(join(directory, "files", "final.mp4"), bytes);
    await writeFile(join(directory, "result.json"), `${JSON.stringify({
      format: "hypit.build-result@1",
      sourcePath: join(root, "main.svml"),
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

    const buildLibrary = await openStudioBuildLibrary(videoDistribution, undefined, root, root);
    assert(buildLibrary !== undefined);
    const view = await buildLibrary.library({ section: "tasks" });
    assert.equal(view.runtime, undefined);
    assert.deepEqual(view.tasks.map((item) => [item.id, item.status]), [
      [build, "complete"],
    ]);
    const media = await buildLibrary.library({ section: "artifacts" });
    assert.deepEqual(media.artifacts.map((item) => [item.build, item.output]), [
      [build, "final.video"],
    ]);
    assert.equal(media.artifacts[0]?.output, "final.video");
    const artifact = await buildLibrary.openArtifact(build, "final.video");
    assert.notEqual(artifact, undefined);
    const stream = await artifact!.open({ start: 2, endExclusive: 8 });
    assert.notEqual(stream, undefined);
    const opened: number[] = [];
    for await (const chunk of stream!) opened.push(...chunk);
    assert.deepEqual(Uint8Array.from(opened), bytes.slice(2, 8));
    await buildLibrary.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const mediaTypeRef = { module: { name: "example", version: "1" }, name: "Media" };

test("media listing reads finished history and leaves active Result drafts private", async () => {
  const owner = "bld_20260902T130000010Z_0000000001";
  const active = "bld_20260902T130000011Z_0000000001";
  const image = { type: mediaTypeRef, value: { kind: "build-file" as const, path: "files/portrait.png", mediaType: "image/png", size: 100 } };
  const manifests: BuildResult[] = [{
    format: "hypit.build-result@1", id: owner, sourcePath: "/project/main.svml",
    targets: ["portrait.image"], outcome: "failed", finishedAt: 300,
    failure: "Rendering failed",
    outputs: {
      "portrait.image": image,
      "data.json": { type: mediaTypeRef, value: { kind: "build-file", path: "files/data.json", mediaType: "application/json", size: 20 } },
      "prepared.video": { type: mediaTypeRef, value: { kind: "value", path: "values/prepared.json" } },
      "semantic.take": { type: mediaTypeRef, value: { kind: "value", path: "values/semantic.json" } },
    },
  }];
  const resolved: string[] = [];
  const results: BuildResultHistory = {
    async read(build) { return manifests.find((item) => item.id === build); },
    async browse() { return { results: manifests }; },
    async resolve(_build, output) {
      resolved.push(output);
      throw new Error(`Listing should not resolve ${output}`);
    },
    async openFile() { throw new Error("Listing never reads media bytes"); },
  };
  const view: BuildView = {
    ...activeBuild(active, "/project"), sourcePath: "/project/main.svml",
    activity: "running", requests: { total: 4, completed: 2 },
  };
  const input = { workspaceRoot: "/project", results, runtime: { async activity() { return { builds: [view], capacity: [] }; } } };
  const tasks = await readStudioLibrary({ ...input, section: "tasks" });
  assert.deepEqual(resolved, []);
  assert.deepEqual(tasks.artifacts, []);
  assert.deepEqual(tasks.tasks.map((task) => [task.id, task.ongoing, task.status]), [[active, true, "running"], [owner, false, "failed"]]);
  assert.equal(tasks.tasks[1]?.detail, "Rendering failed");
  assert.equal(tasks.tasks[1]?.finishedAt, 300);
  assert.deepEqual(tasks.tasks[0]?.requests, { total: 4, completed: 2 });
  assert.equal("acceptedRecords" in tasks.tasks[0]!, false);

  const media = await readStudioLibrary({ ...input, section: "artifacts" });
  assert.equal(media.artifacts.length, 1);
  const portrait = media.artifacts.find((item) => item.mediaType === "image/png")!;
  assert.deepEqual(portrait.origins.map((origin) => [origin.build, origin.output]), [[owner, "portrait.image"]]);
  assert.deepEqual(resolved, []);
  assert.equal(media.artifacts.some((item) => item.build === active), false);

  const selected = await readStudioLibrary({ ...input, section: "artifacts", build: owner });
  assert.deepEqual(selected.artifacts.map((item) => item.output), ["portrait.image"]);
  const outside = await readStudioLibrary({ ...input, section: "artifacts", workspaceRoot: "/different-project", build: owner });
  assert.deepEqual(outside.artifacts, []);
});
