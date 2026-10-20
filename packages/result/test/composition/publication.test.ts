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
  compositeType,
  publication,
  videoType,
} from "./repository-scenario.js";

test("internal progress and already published Outputs leave Result files untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-progress-"));
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_20260902T100000000Z_0000000001",
      source: { id: "/project/main.svml" },
      publication: publication([{ name: "answer", output: "logical:answer", displayName: "Answer" }], ["answer"]),
    });
    const paths = ["result.json", ".writer.json"].map((name) => join(result.directory, name));
    const resources = { async open() { throw new Error("scalar Outputs have no Resource bytes"); } };
    const snapshot = (ready: boolean) => acceptedRecords({
      records: [{ id: "record:answer", type: videoType, value: (42) }],
      bindings: ready ? [{ output: "logical:answer", record: "record:answer" }] : [],
    });
    const unchanged = async (ready: boolean) => {
      // A fixed old mtime exposes even identical-byte rewrites, without timer-resolution assumptions.
      for (const path of paths) await utimes(path, 1, 1);
      const before = await Promise.all(paths.map((path) => stat(path, { bigint: true })));
      await result.sync({ records: snapshot(ready), resources });
      const after = await Promise.all(paths.map((path) => stat(path, { bigint: true })));
      assert.deepEqual(after.map((item) => [item.ino, item.mtimeNs]), before.map((item) => [item.ino, item.mtimeNs]));
    };
    await unchanged(false);
    assert.deepEqual((await result.read()).outputs, {});
    await result.sync({ records: snapshot(true), resources });
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
      source: { id: "/project/main.svml" },
      publication: publication([{ name: "answer", output: "logical:answer" }], ["answer"]),
    });
    const manifestPath = join(result.directory, "result.json");
    const oldManifest = await open(manifestPath, "r");
    readers.push(oldManifest);
    const oldWriter = await open(join(result.directory, ".writer.json"), "r");
    readers.push(oldWriter);
    const writerBytes = await readFile(join(result.directory, ".writer.json"), "utf8");
    await result.sync({
      records: acceptedRecords({
        records: [{ id: "record:answer", type: videoType, value: (42) }],
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

test("publication facts are rejected before a Result directory is created", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-invalid-publication-"));
  try {
    await assert.rejects(FileBuildResult.create(root, {
      id: "bld_20260902T100000000Z_0000000001",
      source: { id: "main.svml" },
      publication: { outputs: [{
        name: "answer",
        output: "logical:answer",
        target: true,
        source: { kind: "current-record", record: "record:answer" },
      }] },
    } as unknown as Parameters<typeof FileBuildResult.create>[1]), /type must be a Type reference/u);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a current Record must match the public Output type", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-publication-type-"));
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_20260902T100000000Z_0000000001",
      source: { id: "main.svml" },
      publication: publication([{ name: "answer", output: "logical:answer" }], ["answer"]),
    });
    await assert.rejects(result.sync({
      records: acceptedRecords({
        records: [{ id: "record:answer", type: compositeType, value: (42) }],
        bindings: [{ output: "logical:answer", record: "record:answer" }],
      }),
      resources: { async open() { throw new Error("unexpected Resource read"); } },
    }), /wrong type for published Output answer/u);
    assert.deepEqual((await result.read()).outputs, {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("public Output names are exact data keys, including JavaScript object names", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-output-names-"));
  const names = ["constructor", "toString", "__proto__"];
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_20260902T100000000Z_0000000001",
      source: { id: "main.svml" },
      publication: publication(names.map((name, index) => ({
        name,
        output: `logical:${String(index)}`,
        record: `record:${String(index)}`,
      })), names),
    });
    await result.sync({
      records: names.map((_name, index) => ({ id: `record:${String(index)}`, type: videoType, value: index })),
      resources: { async open() { throw new Error("scalar Outputs have no Resource bytes"); } },
    });
    const manifest = await result.finish({ outcome: "complete" });
    assert.deepEqual(Object.keys(manifest.outputs).sort(), [...names].sort());
    for (const [index, name] of names.entries()) {
      assert.deepEqual(manifest.outputs[name]?.value, { kind: "inline", value: index });
    }

    const repository = new FileBuildResultRepository(root);
    assert.equal((await repository.resolve(manifest.id, "constructor"))?.value.kind, "inline");
    assert.equal(await repository.resolve(manifest.id, "valueOf"), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a complete Result requires every declared target Output", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-completion-"));
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_20260902T100000000Z_0000000001",
      source: { id: "main.svml" },
      publication: publication([{ name: "answer", output: "logical:answer" }], ["answer"]),
    });
    await assert.rejects(result.finish({ outcome: "complete" }), /target Outputs are published: answer/u);
    assert.equal((await result.read()).outcome, undefined);
    assert.equal((await result.finish({ outcome: "failed", failure: "producer stopped" })).outcome, "failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
