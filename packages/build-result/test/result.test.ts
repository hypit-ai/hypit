import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildResultDirectory, FileBuildResult, FileBuildResultRepository } from "@hypit/build-result";
import type { BlobRef, BuildState, TypeRef } from "@hypit/protocol";

const videoType: TypeRef = {
  module: { name: "example.media", version: "1" },
  name: "Video",
};
const takeType: TypeRef = {
  module: { name: "example.speech", version: "1" },
  name: "SemanticTake",
};

function state(input: {
  readonly status?: BuildState["status"];
  readonly records: BuildState["records"];
  readonly bindings: readonly { readonly output: string; readonly record: string }[];
}): BuildState {
  return {
    status: input.status ?? "active",
    records: input.records,
    plan: {
      outputBindings: input.bindings.map((binding) => ({
        ...binding,
        type: input.records.find((record) => record.id === binding.record)?.type ?? videoType,
      })),
    },
  } as unknown as BuildState;
}

test("internal progress and already published Outputs leave Result files untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-progress-"));
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_20260902T100000000Z_0000000001",
      source: { path: "/project/main.svml" }, targets: ["answer"],
      publishedOutputs: [{ name: "answer", output: "logical:answer", displayName: "Answer" }],
    });
    const paths = ["result.json", ".writer.json"].map((name) => join(result.directory, name));
    const resources = { async open() { throw new Error("scalar Outputs have no Resource bytes"); } };
    const snapshot = (ready: boolean) => state({
      records: [{ id: "record:answer", type: videoType, value: { kind: "inline", value: 42 } }],
      bindings: ready ? [{ output: "logical:answer", record: "record:answer" }] : [],
    });
    const unchanged = async (ready: boolean) => {
      // A fixed old mtime exposes even identical-byte rewrites, without timer-resolution assumptions.
      for (const path of paths) await utimes(path, 1, 1);
      const before = await Promise.all(paths.map((path) => stat(path, { bigint: true })));
      await result.sync({ state: snapshot(ready), resources });
      const after = await Promise.all(paths.map((path) => stat(path, { bigint: true })));
      assert.deepEqual(after.map((item) => [item.ino, item.mtimeNs]), before.map((item) => [item.ino, item.mtimeNs]));
    };
    await unchanged(false);
    assert.deepEqual((await result.read()).outputs, {});
    await result.sync({ state: snapshot(true), resources });
    assert.deepEqual((await result.read()).outputs.answer?.value, { kind: "inline", value: 42 });
    assert.equal((await result.read()).outputs.answer?.displayName, "Answer");
    await unchanged(true);
    const finished = await result.finish({ outcome: "failed", failure: "a later Need failed" });
    assert.equal(finished.outcome, "failed");
    assert.equal(finished.outputs.answer?.displayName, "Answer");
    assert.deepEqual(finished.outputs.answer?.value, { kind: "inline", value: 42 });
    assert.equal((await readdir(result.directory)).includes(".writer.json"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publishing and finishing preserve open readers of the previous Result files", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-读者-"));
  const readers: Awaited<ReturnType<typeof open>>[] = [];
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_20260902T100000000Z_0000000001",
      source: { path: "/project/main.svml" }, targets: ["answer"],
      publishedOutputs: [{ name: "answer", output: "logical:answer" }],
    });
    const manifestPath = join(result.directory, "result.json");
    const oldManifest = await open(manifestPath, "r");
    readers.push(oldManifest);
    const oldWriter = await open(join(result.directory, ".writer.json"), "r");
    readers.push(oldWriter);
    const writerBytes = await readFile(join(result.directory, ".writer.json"), "utf8");
    await result.sync({
      state: state({
        records: [{ id: "record:answer", type: videoType, value: { kind: "inline", value: 42 } }],
        bindings: [{ output: "logical:answer", record: "record:answer" }],
      }),
      resources: { async open() { throw new Error("unexpected Resource read"); } },
    });
    assert.deepEqual(JSON.parse(await oldManifest.readFile("utf8")).outputs, {});
    assert.equal(await oldWriter.readFile("utf8"), writerBytes);
    assert.deepEqual((await result.read()).outputs.answer?.value, { kind: "inline", value: 42 });
    const publishedReader = await open(manifestPath, "r");
    readers.push(publishedReader);
    await result.finish({ outcome: "complete" });
    assert.equal(JSON.parse(await publishedReader.readFile("utf8")).outcome, undefined);
    assert.equal((await result.read()).outcome, "complete");
  } finally {
    await Promise.all(readers.map((reader) => reader.close()));
    await rm(root, { recursive: true, force: true });
  }
});

test("one same-Build resource backs a public video and a SemanticTake payload", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-build-result-"));
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const video: BlobRef = {
    kind: "blob",
    resource: "res_same-build-video",
    size: bytes.byteLength,
    mediaType: "video/mp4",
  };
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_20260902T100000000Z_0000000001",
      source: { path: "/project/main.svml" },
      run: { path: "/project/build.svrun" },
      targets: ["shot.video"],
      publishedOutputs: [
        { name: "shot.video", output: "logical:shot-video" },
        { name: "shot.take", output: "logical:shot-take" },
        { name: "shot.take-copy", output: "logical:shot-take-copy" },
        { name: "unused.video", output: "logical:unused" },
      ],
    });
    assert.equal(
      result.directory,
      join(root, "2026-09-02", "bld_20260902T100000000Z_0000000001"),
    );
    const storedManifest = JSON.parse(await readFile(join(result.directory, "result.json"), "utf8")) as object;
    assert.equal(Object.hasOwn(storedManifest, "id"), false);
    assert.equal((await result.read()).id, "bld_20260902T100000000Z_0000000001");
    const manifest = await result.sync({
      state: state({
        records: [
          { id: "record:video", type: videoType, value: video },
          {
            id: "record:take",
            type: takeType,
            value: { kind: "inline", value: { media: { visual: { artifact: video } } } },
          },
        ],
        bindings: [
          { output: "logical:shot-video", record: "record:video" },
          { output: "logical:shot-take", record: "record:take" },
          { output: "logical:shot-take-copy", record: "record:take" },
          { output: "logical:unused", record: "record:unused" },
        ],
      }),
      resources: {
        async open(artifact) {
          assert.equal(artifact.resource, video.resource);
          return (async function* () { yield bytes; })();
        },
      },
    });
    assert.deepEqual(Object.keys(manifest.outputs).sort(), ["shot.take", "shot.take-copy", "shot.video"]);
    assert.equal(manifest.outputs["shot.video"]?.value.kind, "build-file");
    assert.equal(manifest.outputs["shot.take"]?.value.kind, "value");
    const videoPath = manifest.outputs["shot.video"]?.value.kind === "build-file"
      ? manifest.outputs["shot.video"].value.path
      : undefined;
    const takePath = manifest.outputs["shot.take"]?.value.kind === "value"
      ? manifest.outputs["shot.take"].value.path
      : undefined;
    assert.ok(videoPath);
    assert.ok(takePath);
    assert.equal(manifest.outputs["shot.take-copy"]?.value.kind === "value"
      ? manifest.outputs["shot.take-copy"].value.path
      : undefined, takePath);
    assert.equal(videoPath, "files/file-0001.mp4");
    const take = JSON.parse(await readFile(join(result.directory, takePath), "utf8")) as {
      readonly format: string;
      readonly value: { readonly media: { readonly visual: { readonly artifact: null } } };
      readonly resources: readonly [{ readonly at: readonly string[]; readonly file: { readonly path: string } }];
    };
    assert.equal(take.format, "hypit.result-value@1");
    assert.equal(take.value.media.visual.artifact, null);
    assert.deepEqual(take.resources[0].at, ["media", "visual", "artifact"]);
    assert.equal(take.resources[0].file.path, videoPath);
    assert.deepEqual(await readdir(join(result.directory, "files")), [videoPath.split("/").at(-1)]);

    const failed = await result.finish({ outcome: "failed", failure: "final render failed" });
    assert.equal(failed.outcome, "failed");
    assert.equal(failed.failure, "final render failed");
    assert.deepEqual(Object.keys(failed.outputs).sort(), ["shot.take", "shot.take-copy", "shot.video"]);
    await result.finish({ outcome: "failed", failure: "final render failed" });
    assert.equal((await readdir(result.directory)).includes(".writer.json"), false);
    await assert.rejects(
      result.finish({ outcome: "complete" }),
      /already finished with a different outcome/u,
    );
    const repository = new FileBuildResultRepository(root);
    const presented = await repository.updatePresentation("bld_20260902T100000000Z_0000000001", {
      outputDisplayNames: { "shot.video": "Opening portrait" },
      title: "Episode 12 opening",
      note: "Use the quieter take.",
      highlightedOutputs: ["shot.video", "shot.take", "shot.video"],
    });
    assert.equal(presented.title, "Episode 12 opening");
    assert.equal(presented.outputs["shot.video"]?.displayName, "Opening portrait");
    assert.deepEqual(presented.outputs["shot.video"]?.value, failed.outputs["shot.video"]?.value);
    assert.equal(presented.outputs["shot.take"]?.displayName, undefined);
    assert.equal((await repository.read(presented.id))?.outputs["shot.video"]?.displayName, "Opening portrait");
    await assert.rejects(repository.updatePresentation(presented.id, { outputDisplayNames: { missing: "Oops" } }), /has no Output/);
    await assert.rejects(repository.updatePresentation(presented.id, { outputDisplayNames: { "shot.video": "  " } }), /must not be empty/);
    assert.equal(presented.note, "Use the quieter take.");
    assert.deepEqual(presented.highlightedOutputs, ["shot.video", "shot.take"]);
    await assert.rejects(
      repository.updatePresentation("bld_20260902T100000000Z_0000000001", { highlightedOutputs: ["missing.output"] }),
      /has no Output missing\.output/u,
    );
    const cleared = await repository.updatePresentation("bld_20260902T100000000Z_0000000001", {
      outputDisplayNames: { "shot.video": null },
      title: null,
      note: null,
      highlightedOutputs: [],
    });
    assert.equal(cleared.outputs["shot.video"]?.displayName, undefined);
    assert.equal(cleared.title, undefined);
    assert.equal(cleared.note, undefined);
    assert.equal(cleared.highlightedOutputs, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("filesystem repository streams one normalized byte range", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-range-"));
  const build = "bld_20260902T100000009Z_0000000001";
  try {
    const directory = buildResultDirectory(root, build);
    await mkdir(join(directory, "files"), { recursive: true });
    const bytes = new TextEncoder().encode("abcdefghij");
    await writeFile(join(directory, "files", "video.mp4"), bytes);
    const repository = new FileBuildResultRepository(root);
    const stream = await repository.openFile(build, {
      kind: "build-file",
      path: "files/video.mp4",
      size: bytes.byteLength,
      mediaType: "video/mp4",
    }, { start: 3, endExclusive: 7 });
    assert.notEqual(stream, undefined);
    const chunks: number[] = [];
    for await (const chunk of stream!) chunks.push(...chunk);
    assert.equal(new TextDecoder().decode(Uint8Array.from(chunks)), "defg");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("filesystem decodes Result and writer data before exposing it", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-decode-"));
  const malformed = "bld_20260902T100000010Z_0000000001";
  const unfinished = "bld_20260902T100000011Z_0000000001";
  try {
    const directory = buildResultDirectory(root, malformed);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "result.json"), JSON.stringify({
      format: "hypit.build-result@1",
      source: { path: "main.svml" },
      targets: ["video"],
      outputs: {
        video: {
          type: videoType,
          value: { kind: "build-file", path: "../outside.mp4", size: 1, mediaType: "video/mp4" },
        },
      },
    }));
    const repository = new FileBuildResultRepository(root);
    await assert.rejects(repository.read(malformed), /outputs\["video"\]\.value\.path is not a Result-relative path/u);

    const writer = await repository.create({
      id: unfinished,
      source: { path: "main.svml" },
      targets: [],
      publishedOutputs: [],
    });
    await writeFile(join(buildResultDirectory(root, unfinished), ".writer.json"), JSON.stringify({
      resources: null,
      values: {},
      publishedOutputs: [],
      forwards: [],
    }));
    await assert.rejects(writer.sync({
      state: state({ records: [], bindings: [] }),
      resources: { async open() { return undefined; } },
    }), /\.writer\.json\.resources must be an object/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reserved-looking domain objects remain ordinary Composite data", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-json-reference-"));
  const id = "bld_20260902T100000000Z_0000000001";
  try {
    const directory = buildResultDirectory(root, id);
    await mkdir(join(directory, "values"), { recursive: true });
    await writeFile(join(directory, "result.json"), JSON.stringify({
      format: "hypit.build-result@1",
      source: { path: "main.svml" },
      targets: ["value"],
      outcome: "complete",
      finishedAt: 1,
      outputs: { value: { type: videoType, value: { kind: "value", path: "values/value-0001.json" } } },
    }));
    await writeFile(join(directory, "values", "value-0001.json"), JSON.stringify({
      format: "hypit.result-value@1",
      value: { nested: { kind: "build-output", build: id, output: "value" } },
      resources: [],
    }));
    const resolved = await new FileBuildResultRepository(root).resolve(id, "value");
    assert.equal(resolved?.value.kind, "value");
    if (resolved?.value.kind !== "value") throw new Error("expected Composite Result value");
    assert.deepEqual(resolved.value.document.value, {
      nested: { kind: "build-output", build: id, output: "value" },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("describing a Composite Output reads only its manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-describe-"));
  const id = "bld_20260902T100000020Z_0000000001";
  try {
    const directory = buildResultDirectory(root, id);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "result.json"), JSON.stringify({
      format: "hypit.build-result@1",
      source: { path: "main.svml" },
      targets: ["take"],
      outcome: "complete",
      finishedAt: 1,
      outputs: { take: { type: takeType, value: { kind: "value", path: "values/missing.json" } } },
    }));
    const repository = new FileBuildResultRepository(root);
    const description = await repository.describeOutput(id, "take");
    assert.equal(description?.kind, "composite");
    await assert.rejects(repository.resolve(id, "take"), /missing\.json/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an explicitly reused public output is a forward reference and copies no bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-build-result-reuse-"));
  try {
    const prior = await FileBuildResult.create(root, {
      id: "bld_20260902T100000001Z_0000000001",
      source: { path: "/project/main.svml" },
      targets: ["opening.video"],
      publishedOutputs: [{ name: "opening.video", output: "logical:opening-video" }],
    });
    await prior.sync({
      state: state({
        records: [{
          id: "record:opening",
          type: videoType,
          value: { kind: "blob", resource: "res_opening", size: 10, mediaType: "video/mp4" },
        }],
        bindings: [{ output: "logical:opening-video", record: "record:opening" }],
      }),
      resources: { async open() { return (async function* () { yield new Uint8Array(10); })(); } },
    });
    const reused = {
      id: "bld_20260902T100000002Z_0000000002",
      source: { path: "/project/main.svml" },
      targets: ["shot.video"],
      publishedOutputs: [{ name: "shot.video", output: "logical:shot-video" }],
      forwards: [{ output: "logical:shot-video", build: "bld_20260902T100000001Z_0000000001", sourceOutput: "opening.video" }],
    } as const;
    await assert.rejects(FileBuildResult.create(root, reused), /is not a finished Result/u);
    await prior.finish({ outcome: "complete" });
    await assert.rejects(
      new FileBuildResultRepository(root).removeIncomplete("bld_20260902T100000001Z_0000000001"),
      /cannot be removed/u,
    );
    const result = await FileBuildResult.create(root, reused);
    const manifest = await result.sync({
      state: state({
        records: [{
          id: "record:prior",
          type: videoType,
          value: {
            kind: "blob",
            resource: "res_prior_video",
            size: 10,
            mediaType: "video/mp4",
          },
        }],
        bindings: [{ output: "logical:shot-video", record: "record:prior" }],
      }),
      resources: {
        async open() {
          throw new Error("a forwarded output must not copy its historical bytes");
        },
      },
    });
    assert.deepEqual(manifest.outputs["shot.video"]?.value, {
      kind: "build-output",
      build: "bld_20260902T100000001Z_0000000001",
      output: "opening.video",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("filesystem Results have one public name per Output and browse newest first", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-build-result-browse-"));
  const repository = new FileBuildResultRepository(root);
  const ids = [
    "bld_20260901T100000001Z_0000000001",
    "bld_20260902T100000002Z_0000000001",
    "bld_20260903T100000003Z_0000000001",
  ];
  try {
    await assert.rejects(repository.create({
      id: "bld_20260902T100000000Z_0000000001",
      source: { path: "/project/main.svml" },
      targets: ["video"],
      publishedOutputs: [
        { name: "video", output: "logical:video" },
        { name: "duplicate", output: "logical:video" },
      ],
    }), /has more than one published name/u);

    for (const id of ids) {
      const writer = await repository.create({
        id,
        source: { path: "/project/main.svml" },
        targets: ["video"],
        publishedOutputs: [{ name: "video", output: "logical:video" }],
      });
      await writer.finish({ outcome: "failed", failure: "ordering fixture" });
    }
    assert.deepEqual(await readdir(root), ["2026-09-01", "2026-09-02", "2026-09-03"]);

    const first = await repository.browse({ limit: 2 });
    assert.deepEqual(first.results.map((item) => item.id), [ids[2], ids[1]]);
    assert.equal(first.next, ids[1]);
    if (first.next === undefined) throw new Error("expected an older Result cursor");
    const second = await repository.browse({ limit: 2, before: first.next });
    assert.deepEqual(second.results.map((item) => item.id), [ids[0]]);
    assert.equal(second.next, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
