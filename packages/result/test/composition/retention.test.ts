import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { buildResultDirectory, FileBuildResult, FileBuildResultStore } from "@hypit/result/runtime-storage/node";
import type { BlobRef } from "@hypit/protocol";

import {
  structuredType,
  resultIntent,
  videoType,
} from "./repository-scenario.js";

test("internal progress and already stored Outputs leave Result files untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-progress-"));
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_20260902T100000000Z_0000000001",
      sourcePath: "/project/main.svml",
      targets: ["answer"],
      intent: resultIntent([{ name: "answer" }]),
    });
    const paths = ["result.json", ".writer.json"].map((name) => join(result.directory, name));
    const resources = { async open() { throw new Error("scalar Outputs have no Resource bytes"); } };
    const snapshot = (ready: boolean) => ready
      ? [{ id: "record:answer", type: videoType, value: (42) }]
      : [];
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
    await unchanged(true);
    const finished = await result.finish({ outcome: "failed", failure: "a later Need failed" });
    assert.equal(finished.outcome, "failed");
    assert.deepEqual(finished.outputs.answer?.value, { kind: "inline", value: 42 });
    assert.equal((await readdir(result.directory)).includes(".writer.json"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("storing and finishing preserve open readers of the previous Result files", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-读者-"));
  const readers: Awaited<ReturnType<typeof open>>[] = [];
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_20260902T100000000Z_0000000001",
      sourcePath: "/project/main.svml",
      targets: ["answer"],
      intent: resultIntent([{ name: "answer" }]),
    });
    const manifestPath = join(result.directory, "result.json");
    const oldManifest = await open(manifestPath, "r");
    readers.push(oldManifest);
    const oldWriter = await open(join(result.directory, ".writer.json"), "r");
    readers.push(oldWriter);
    const writerBytes = await readFile(join(result.directory, ".writer.json"), "utf8");
    await result.sync({
      records: [{ id: "record:answer", type: videoType, value: (42) }],
      resources: { async open() { throw new Error("unexpected Resource read"); } },
    });
    assert.deepEqual(JSON.parse(await oldManifest.readFile("utf8")).outputs, {});
    assert.equal(await oldWriter.readFile("utf8"), writerBytes);
    assert.deepEqual((await result.read()).outputs.answer?.value, { kind: "inline", value: 42 });
    const storedReader = await open(manifestPath, "r");
    readers.push(storedReader);
    await result.finish({ outcome: "complete" });
    assert.equal(JSON.parse(await storedReader.readFile("utf8")).outcome, undefined);
    assert.equal((await result.read()).outcome, "complete");
  } finally {
    await Promise.all(readers.map((reader) => reader.close()));
    await rm(root, { recursive: true, force: true });
  }
});

test("Result intent facts are rejected before a Result directory is created", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-invalid-intent-"));
  try {
    await assert.rejects(FileBuildResult.create(root, {
      id: "bld_20260902T100000000Z_0000000001",
      sourcePath: "main.svml",
      targets: ["answer"],
      intent: { outputs: [{
        name: "answer",
        type: structuredType,
        record: "record:answer",
      }] },
    } as unknown as Parameters<typeof FileBuildResult.create>[1]), /unexpected type field/u);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a retained Output records the accepted Record type", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-intent-type-"));
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_20260902T100000000Z_0000000001",
      sourcePath: "main.svml",
      targets: ["answer"],
      intent: resultIntent([{ name: "answer" }]),
    });
    await result.sync({
      records: [{ id: "record:answer", type: structuredType, value: (42) }],
      resources: { async open() { throw new Error("unexpected Resource read"); } },
    });
    assert.deepEqual((await result.read()).outputs.answer?.type, structuredType);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retained Output names are exact data keys, including JavaScript object names", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-output-names-"));
  const names = ["constructor", "toString", "__proto__"];
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_20260902T100000000Z_0000000001",
      sourcePath: "main.svml",
      targets: names,
      intent: resultIntent(names.map((name, index) => ({
        name,
        record: `record:${String(index)}`,
      }))),
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

    const repository = new FileBuildResultStore(root);
    assert.equal((await repository.resolve(manifest.id, "constructor"))?.value.kind, "inline");
    assert.equal(await repository.resolve(manifest.id, "valueOf"), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a complete Result requires every retained Output", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-completion-"));
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_20260902T100000000Z_0000000001",
      sourcePath: "main.svml",
      targets: ["answer"],
      intent: resultIntent([{ name: "answer" }]),
    });
    await assert.rejects(result.finish({ outcome: "complete" }), /retained Outputs are stored: answer/u);
    assert.equal((await result.read()).outcome, undefined);
    assert.equal((await result.finish({ outcome: "failed", failure: "producer stopped" })).outcome, "failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
