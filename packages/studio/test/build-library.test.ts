import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { buildResultDirectory, FileBuildResultRepository } from "@hypit/build-result";
import type { BuildResultRepository } from "@hypit/build-result";
import type { BuildView } from "@hypit/runtime-host-node";
import { buildIdCreatedAt } from "@hypit/protocol";

import { openStudioBuildLibrary, readStudioLibrary } from "../src/build-library.js";

function activeBuild(id: string, root: string): BuildView {
  return {
    id,
    createdAt: buildIdCreatedAt(id)!,
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
    format: "hypit.build-result@1" as const,
    id: entry.id,
    source: entry.source!,
    ...(entry.run === undefined ? {} : { run: entry.run }),
    targets: ["final.video"],
    finishedAt: entry.createdAt,
    outcome: "complete" as const,
    outputs: {
      "final.video": {
        displayName: "Final cut",
        type: { module: { name: "example", version: "1" }, name: "Video" },
        value: { kind: "build-file" as const, path: "files/final.video.mp4", size: 42, mediaType: "video/mp4" },
      },
    },
  }));
  const results: BuildResultRepository = {
    async create() { throw new Error("not used"); },
    async openWriter() { return undefined; },
    async removeIncomplete() {},
    async updatePresentation() { throw new Error("read-only fixture"); },
    async read(build) { return manifests.find((item) => item.id === build); },
    async browse(request) {
      if (request?.before !== undefined) return { results: [] };
      assert.deepEqual(request, { limit: 25 });
      return { results: manifests, next: relevant.id };
    },
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
    async describeFile(_build, file) { return file; },
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
    run: task.run,
    targets: task.targets,
  })), [{
    id: "bld_20260902T130000000Z_0000000001",
    status: "saving-result",
    source: "author/main.svml",
    run: "runs/build.svrun",
    targets: ["final.video"],
  }]);
  assert.deepEqual(view.artifacts, []);
  const media = await readStudioLibrary({ ...input, section: "artifacts" });
  assert.deepEqual(media.tasks, []);
  assert.equal(media.artifacts[0]?.displayName, "Final cut");
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
    const view = await buildLibrary.library({ section: "tasks" });
    assert.equal(view.runtime, undefined);
    assert.deepEqual(view.tasks.map((item) => [item.id, item.title, item.status]), [
      [build, "First cut", "complete"],
    ]);
    const media = await buildLibrary.library({ section: "artifacts" });
    assert.deepEqual(media.artifacts.map((item) => [item.build, item.output]), [
      [build, "final.video"],
    ]);
    await buildLibrary.renameArtifact(build, "final.video", "Renamed final");
    const renamed = await buildLibrary.library({ section: "artifacts" });
    assert.equal(renamed.artifacts[0]?.displayName, "Renamed final");
    assert.equal(renamed.artifacts[0]?.nameEditable, true);
    assert.equal(renamed.artifacts[0]?.output, "final.video");
    const artifact = await buildLibrary.openArtifact(build, "final.video");
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

const mediaTypeRef = { module: { name: "example", version: "1" }, name: "Media" };

test("media listing includes active files, follows file references and leaves Composite Outputs unopened", async () => {
  const owner = "bld_20260902T130000010Z_0000000001";
  const active = "bld_20260902T130000011Z_0000000001";
  const image = { type: mediaTypeRef, value: { kind: "build-file" as const, path: "files/portrait.png", mediaType: "image/png", size: 100 } };
  const manifests: import("@hypit/build-result").BuildResultManifest[] = [{
    format: "hypit.build-result@1", id: owner, source: { path: "/project/main.svml" },
    run: { path: "/project/earlier.svrun" }, targets: ["portrait.image"], outcome: "failed", finishedAt: 300,
    failure: "Rendering failed", highlightedOutputs: ["portrait.image"],
    outputs: {
      "portrait.image": image,
      "data.json": { type: mediaTypeRef, value: { kind: "build-file", path: "files/data.json", mediaType: "application/json", size: 20 } },
      "normalized.video": { type: mediaTypeRef, value: { kind: "value", path: "values/normalized.json" } },
      "semantic.take": { type: mediaTypeRef, value: { kind: "value", path: "values/semantic.json" } },
    },
  }, {
    format: "hypit.build-result@1", id: active, source: { path: "/project/main.svml" },
    run: { path: "/project/current.svrun" }, targets: ["final.video"],
    outputs: {
      "reused.image": { type: mediaTypeRef, value: { kind: "build-output", build: owner, output: "portrait.image" } },
      "voice.audio": { type: mediaTypeRef, value: { kind: "build-file", path: "files/voice.wav", mediaType: "audio/wav", size: 80 } },
      "reused.take": { type: mediaTypeRef, value: { kind: "build-output", build: owner, output: "semantic.take" } },
    },
  }];
  const described: string[] = [];
  const resolved: string[] = [];
  const results: BuildResultRepository = {
    async create() { throw new Error("read-only"); },
    async openWriter() { throw new Error("read-only"); },
    async removeIncomplete() { throw new Error("read-only"); },
    async updatePresentation() { throw new Error("read-only"); },
    async read(build) { return manifests.find((item) => item.id === build); },
    async browse() { return { results: [manifests[0] as import("@hypit/build-result").FinishedBuildResultManifest] }; },
    async describeOutput(_build, output) {
      described.push(output);
      if (output === "reused.take") return { kind: "composite", type: mediaTypeRef };
      assert.equal(output, "reused.image");
      return { kind: "resource", type: mediaTypeRef, mediaType: "image/png", size: 100 };
    },
    async resolve(_build, output) {
      resolved.push(output);
      assert.equal(output, "reused.image", "No Composite value or non-media file should be opened");
      return { ...image, build: owner, output: "portrait.image" };
    },
    async describeFile(_build, file) { return file; },
    async openFile() { throw new Error("Listing never reads media bytes"); },
  };
  const view: BuildView = {
    ...activeBuild(active, "/project"), source: { path: "/project/main.svml" },
    run: { path: "/project/current.svrun" }, activity: "running", requests: { total: 4, completed: 2 },
  };
  const input = { workspaceRoot: "/project", results, runtime: { async activity() { return { builds: [view], capacity: [] }; } } };
  const tasks = await readStudioLibrary({ ...input, section: "tasks" });
  assert.deepEqual(described, []);
  assert.deepEqual(resolved, []);
  assert.deepEqual(tasks.artifacts, []);
  assert.deepEqual(tasks.tasks.map((task) => [task.id, task.ongoing, task.status]), [[active, true, "running"], [owner, false, "failed"]]);
  assert.equal(tasks.tasks[1]?.detail, "Rendering failed");
  assert.equal(tasks.tasks[1]?.finishedAt, 300);
  assert.deepEqual(tasks.tasks[0]?.requests, { total: 4, completed: 2 });
  assert.equal("acceptedRecords" in tasks.tasks[0]!, false);

  const media = await readStudioLibrary({ ...input, section: "artifacts" });
  assert.equal(media.artifacts.length, 2);
  const portrait = media.artifacts.find((item) => item.mediaType === "image/png")!;
  assert.equal(portrait.ownerBuild, owner);
  assert.equal(portrait.highlighted, true);
  assert.deepEqual(portrait.origins.map((origin) => [origin.build, origin.output]), [[owner, "portrait.image"], [active, "reused.image"]]);
  assert.deepEqual(resolved, ["reused.image"]);
  assert(media.artifacts.some((item) => item.build === active && item.output === "voice.audio"));

  const scoped = await readStudioLibrary({ ...input, section: "artifacts", run: "current.svrun" });
  assert.equal(scoped.artifacts.length, 2);
  assert(scoped.artifacts.every((item) => item.origins.every((origin) => origin.build === active)));
  const selected = await readStudioLibrary({ ...input, section: "artifacts", build: owner });
  assert.deepEqual(selected.artifacts.map((item) => item.output), ["portrait.image"]);
  const outside = await readStudioLibrary({ ...input, section: "artifacts", workspaceRoot: "/different-project", build: owner });
  assert.deepEqual(outside.artifacts, []);
});

test("Studio groups repeated external file references and retains both Build uses", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-studio-external-"));
  try {
    const imagePath = join(root, "portrait.png");
    await writeFile(imagePath, new Uint8Array([1, 2]));
    const results = new FileBuildResultRepository(join(root, "results"));
    const type = { module: { name: "example", version: "1" }, name: "Image" };
    for (const id of ["bld_20260902T130000000Z_0000000001", "bld_20260902T130000001Z_0000000001"]) {
      const writer = await results.create({ id, source: { path: join(root, "main.svml") },
        targets: ["portrait"], publishedOutputs: [{ name: "portrait", output: "portrait" }],
        resourceReferences: { res_image: { kind: "external-file", uri: pathToFileURL(imagePath).href,
          size: 2, mediaType: "image/png" } } });
      await writer.sync({ state: { status: "complete", records: [{ id: "image", type,
        value: { kind: "blob", resource: "res_image", size: 2, mediaType: "image/png" } }],
        plan: { outputBindings: [{ output: "portrait", record: "image", type }] },
      } as unknown as import("@hypit/protocol").BuildState,
      resources: { async open() { throw new Error("No bytes should be copied"); } } });
      await writer.finish({ outcome: "complete" });
    }
    const view = await readStudioLibrary({ workspaceRoot: root, results, section: "artifacts" });
    assert.equal(view.artifacts.length, 1);
    assert.equal(view.artifacts[0]!.origins.length, 2);
    assert.equal(view.artifacts[0]!.ownerBuild, undefined);
    assert.equal(view.artifacts[0]!.filePath, pathToFileURL(imagePath).href);
  } finally { await rm(root, { recursive: true, force: true }); }
});
