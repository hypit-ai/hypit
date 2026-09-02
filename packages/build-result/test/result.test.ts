import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileBuildResult, FileBuildResultRepository } from "@hypit/build-result";
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
      title: "Episode 12 opening",
      note: "Use the quieter take.",
      highlightedOutputs: ["shot.video", "shot.take", "shot.video"],
    });
    assert.equal(presented.title, "Episode 12 opening");
    assert.equal(presented.note, "Use the quieter take.");
    assert.deepEqual(presented.highlightedOutputs, ["shot.video", "shot.take"]);
    await assert.rejects(
      repository.updatePresentation("bld_20260902T100000000Z_0000000001", { highlightedOutputs: ["missing.output"] }),
      /has no Output missing\.output/u,
    );
    const cleared = await repository.updatePresentation("bld_20260902T100000000Z_0000000001", {
      title: null,
      note: null,
      highlightedOutputs: [],
    });
    assert.equal(cleared.title, undefined);
    assert.equal(cleared.note, undefined);
    assert.equal(cleared.highlightedOutputs, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("filesystem repository streams one normalized byte range", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-range-"));
  try {
    const directory = join(root, "bld_range");
    await mkdir(join(directory, "files"), { recursive: true });
    const bytes = new TextEncoder().encode("abcdefghij");
    await writeFile(join(directory, "files", "video.mp4"), bytes);
    const repository = new FileBuildResultRepository(root);
    const stream = await repository.openFile("bld_range", {
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

test("reserved-looking domain objects remain ordinary Composite data", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-json-reference-"));
  const id = "bld_20260902T100000000Z_0000000001";
  try {
    const directory = join(root, id);
    await mkdir(join(directory, "values"), { recursive: true });
    await writeFile(join(directory, "result.json"), JSON.stringify({
      format: "hypit.build-result@2",
      id,
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
    const result = await FileBuildResult.create(root, {
      id: "bld_20260902T100000002Z_0000000002",
      source: { path: "/project/main.svml" },
      targets: ["shot.video"],
      publishedOutputs: [{ name: "shot.video", output: "logical:shot-video" }],
      forwards: [{ output: "logical:shot-video", build: "bld_20260902T100000001Z_0000000001", sourceOutput: "opening.video" }],
    });
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
    "bld_20260902T100000001Z_0000000001",
    "bld_20260902T100000002Z_0000000001",
    "bld_20260902T100000003Z_0000000001",
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
