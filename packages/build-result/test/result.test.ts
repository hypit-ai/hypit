import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileBuildResult } from "@hypit/build-result";
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
  readonly selections: BuildState["plan"]["selections"];
}): BuildState {
  return {
    status: input.status ?? "active",
    records: input.records,
    plan: { selections: input.selections },
  } as unknown as BuildState;
}

test("one same-Build resource backs a public video and a SemanticTake payload", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-build-result-"));
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const video: BlobRef = {
    kind: "blob",
    resource: "res_same-build-video",
    digest: `sha256:${"1".repeat(64)}`,
    size: bytes.byteLength,
    mediaType: "video/mp4",
  };
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_one",
      source: { path: "/project/main.svml" },
      run: { path: "/project/build.svrun" },
      targets: ["final.video"],
      aliases: [
        { name: "shot.video", output: "logical:shot-video" },
        { name: "shot.take", output: "logical:shot-take" },
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
        selections: [
          { output: "logical:shot-video", candidate: "candidate:generated-video", record: "record:video" },
          { output: "logical:shot-take", candidate: "candidate:aligned-take", record: "record:take" },
          { output: "logical:unused", candidate: "candidate:unused", record: "record:unused" },
        ],
      }),
      artifacts: {
        async open(artifact) {
          assert.equal(artifact.resource, video.resource);
          return (async function* () { yield bytes; })();
        },
      },
    });
    assert.deepEqual(Object.keys(manifest.outputs).sort(), ["shot.take", "shot.video"]);
    assert.equal(manifest.outputs["shot.video"]?.value.kind, "build-file");
    assert.equal(manifest.outputs["shot.take"]?.value.kind, "json");
    const videoPath = manifest.outputs["shot.video"]?.value.kind === "build-file"
      ? manifest.outputs["shot.video"].value.path
      : undefined;
    const takePath = manifest.outputs["shot.take"]?.value.kind === "json"
      ? manifest.outputs["shot.take"].value.path
      : undefined;
    assert.ok(videoPath);
    assert.ok(takePath);
    assert.equal(videoPath, "files/shot.video.mp4");
    const take = JSON.parse(await readFile(join(result.directory, takePath), "utf8")) as {
      readonly media: { readonly visual: { readonly artifact: { readonly path: string } } };
    };
    assert.equal(take.media.visual.artifact.path, videoPath);
    assert.deepEqual(await readdir(join(result.directory, "files")), [videoPath.split("/").at(-1)]);

    const failed = await result.finish({ status: "failed", failure: "final render failed" });
    assert.equal(failed.status, "failed");
    assert.equal(failed.failure, "final render failed");
    assert.deepEqual(Object.keys(failed.outputs).sort(), ["shot.take", "shot.video"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an explicitly reused public output is a forward reference and copies no bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-build-result-reuse-"));
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_new",
      source: { path: "/project/main.svml" },
      targets: ["final.video"],
      aliases: [{ name: "shot.video", output: "logical:shot-video" }],
      reuses: [{ candidate: "candidate:prior", build: "bld_old", output: "opening.video" }],
    });
    const manifest = await result.sync({
      state: state({
        records: [{
          id: "record:prior",
          type: videoType,
          value: {
            kind: "blob",
            digest: `sha256:${"2".repeat(64)}`,
            size: 10,
            mediaType: "video/mp4",
          },
        }],
        selections: [{ output: "logical:shot-video", candidate: "candidate:prior", record: "record:prior" }],
      }),
      artifacts: {
        async open() {
          throw new Error("a forwarded output must not copy its historical bytes");
        },
      },
    });
    assert.deepEqual(manifest.outputs["shot.video"]?.value, {
      kind: "build-output",
      build: "bld_old",
      output: "opening.video",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
