import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { buildResultDirectory, FileBuildResult, FileBuildResultRepository, syncBuildResultOutputs } from "@hypit/result/node";
import type { BlobRef } from "@hypit/protocol";

import {
  acceptedRecords,
  structuredType,
  publication,
  videoType,
} from "./repository-scenario.js";

test("one same-Build resource backs a public video and a structured value", async () => {
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
      sourceId: "/project/main.svml",
      runId: "/project/build.svrun",
      publication: publication([
        { name: "shot.video", output: "logical:shot-video", record: "record:video" },
        { name: "shot.take", output: "logical:shot-take", record: "record:take", type: structuredType },
        { name: "shot.take-copy", output: "logical:shot-take-copy", record: "record:take", type: structuredType },
        { name: "unused.video", output: "logical:unused" },
      ], ["shot.video"]),
    });
    assert.equal(
      result.directory,
      join(root, "2026-09-02", "bld_20260902T100000000Z_0000000001"),
    );
    const storedManifest = JSON.parse(await readFile(join(result.directory, "result.json"), "utf8")) as object;
    assert.equal(Object.hasOwn(storedManifest, "id"), false);
    assert.equal((await result.read()).id, "bld_20260902T100000000Z_0000000001");
    const manifest = await result.sync({
      records: acceptedRecords({
        records: [
          { id: "record:video", type: videoType, value: video },
          {
            id: "record:take",
            type: structuredType,
            value: ({ media: { visual: { artifact: video } } }),
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
