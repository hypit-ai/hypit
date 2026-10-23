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

test("an explicitly reused public output is a forward reference and copies no bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-build-result-reuse-"));
  try {
    const prior = await FileBuildResult.create(root, {
      id: "bld_20260902T100000001Z_0000000001",
      sourceId: "/project/main.svml",
      publication: publication([{ name: "opening.video", output: "logical:opening-video", record: "record:opening" }], ["opening.video"]),
    });
    await prior.sync({
      records: acceptedRecords({
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
      sourceId: "/project/main.svml",
      publication: { outputs: [{
        name: "shot.video", output: "logical:shot-video", target: true, type: videoType,
        source: { kind: "historical-output", build: "bld_20260902T100000001Z_0000000001", output: "opening.video" },
      }] },
    } as const;
    await assert.rejects(FileBuildResult.create(root, reused), /is not a finished Result/u);
    await prior.finish({ outcome: "complete" });
    await assert.rejects(
      new FileBuildResultRepository(root).removeIncomplete("bld_20260902T100000001Z_0000000001"),
      /cannot be removed/u,
    );
    await assert.rejects(FileBuildResult.create(root, {
      ...reused,
      id: "bld_20260902T100000003Z_0000000003",
      publication: { outputs: reused.publication.outputs.map((output) => ({ ...output, type: structuredType })) },
    }), /wrong type for its forwarded Logical Output/u);
    const result = await FileBuildResult.create(root, reused);
    const manifest = await result.sync({
      records: acceptedRecords({
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

test("a forward-only structured value is published from manifests without opening its missing value document", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-manifest-forward-"));
  const priorId = "bld_20260902T100000030Z_0000000001";
  const nextId = "bld_20260902T100000031Z_0000000001";
  try {
    const prior = await FileBuildResult.create(root, {
      id: priorId,
      sourceId: "/project/main.svml",
      publication: publication([{ name: "layout", output: "logical:layout" }], ["layout"]),
    });
    await prior.sync({
      records: acceptedRecords({
        records: [{ id: "record:layout", type: videoType, value: ({ title: "ready" }) }],
        bindings: [{ output: "logical:layout", record: "record:layout" }],
      }),
      resources: { async open() { throw new Error("fixture has no files"); } },
    });
    await prior.finish({ outcome: "complete" });
    await rm(join(prior.directory, "values", "value-0001.json"));

    const forwarded = await FileBuildResult.create(root, {
      id: nextId,
      sourceId: "/project/main.svml",
      publication: { outputs: [{ name: "layout", output: "logical:layout", target: true, type: videoType,
        source: { kind: "historical-output", build: priorId, output: "layout" } }] },
    });
    const manifest = await forwarded.sync({
      records: [],
      resources: { async open() { throw new Error("a forward-only Result has no bytes to open"); } },
    });
    assert.deepEqual(manifest.outputs.layout, {
      type: videoType,
      value: { kind: "build-output", build: priorId, output: "layout" },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
