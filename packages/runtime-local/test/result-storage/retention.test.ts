import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { buildResultDirectory, FileBuildResult, FileBuildResultStore } from "../../src/result-storage/index.js";
import type { BlobRef } from "@hypit/protocol";
import { productPublicationDirectory } from "@hypit/hypit/product/node";

import {
  structuredType,
  publicationIntent,
  videoType,
} from "./repository-scenario.js";

test("internal progress and already stored Outputs leave Result files untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-progress-"));
  try {
    const result = await FileBuildResult.create(root, join(root, "products"), {
      id: "bld_20260902T100000000Z_0000000001",
      sourcePath: "/project/main.svml",
      targets: ["answer"],
      publication: publicationIntent([{ name: "answer" }]),
    });
    const productDirectory = productPublicationDirectory(
      join(root, "products"),
      "bld_20260902T100000000Z_0000000001",
    );
    const paths = [
      join(result.directory, "result.json"),
      join(productDirectory, "product.json"),
      join(productDirectory, ".writer.json"),
    ];
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
    const storedAnswer = (await result.read()).outputs.answer;
    assert.equal(storedAnswer?.representation, "inline");
    assert.equal(storedAnswer?.representation === "inline" ? storedAnswer.value : undefined, 42);
    await unchanged(true);
    const finished = await result.finish({ outcome: "failed", failure: "a later Need failed" });
    assert.equal(finished.outcome, "failed");
    const finishedAnswer = finished.outputs.answer;
    assert.equal(finishedAnswer?.representation, "inline");
    assert.equal(finishedAnswer?.representation === "inline" ? finishedAnswer.value : undefined, 42);
    assert.equal((await readdir(productDirectory)).includes(".writer.json"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("storing and finishing preserve open readers of the previous Result files", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-读者-"));
  const readers: Awaited<ReturnType<typeof open>>[] = [];
  try {
    const result = await FileBuildResult.create(root, join(root, "products"), {
      id: "bld_20260902T100000000Z_0000000001",
      sourcePath: "/project/main.svml",
      targets: ["answer"],
      publication: publicationIntent([{ name: "answer" }]),
    });
    const manifestPath = join(result.directory, "result.json");
    const productDirectory = productPublicationDirectory(
      join(root, "products"),
      "bld_20260902T100000000Z_0000000001",
    );
    const oldManifest = await open(manifestPath, "r");
    readers.push(oldManifest);
    const oldWriter = await open(join(productDirectory, ".writer.json"), "r");
    readers.push(oldWriter);
    const writerBytes = await readFile(join(productDirectory, ".writer.json"), "utf8");
    await result.sync({
      records: [{ id: "record:answer", type: videoType, value: (42) }],
      resources: { async open() { throw new Error("unexpected Resource read"); } },
    });
    assert.deepEqual(JSON.parse(await oldManifest.readFile("utf8")).outputs, {});
    assert.equal(await oldWriter.readFile("utf8"), writerBytes);
    const answer = (await result.read()).outputs.answer;
    assert.equal(answer?.representation, "inline");
    assert.equal(answer?.representation === "inline" ? answer.value : undefined, 42);
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

test("Publication intent facts are rejected before a Result directory is created", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-invalid-intent-"));
  try {
    await assert.rejects(FileBuildResult.create(root, join(root, "products"), {
      id: "bld_20260902T100000000Z_0000000001",
      sourcePath: "main.svml",
      targets: ["answer"],
      publication: { outputs: [{
        name: "answer",
        type: structuredType,
        record: "record:answer",
        publisher: "example.test-product@1",
      }] },
    } as unknown as Parameters<typeof FileBuildResult.create>[2]), /unexpected type field/u);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a published Output records its publisher answer and accepted Record type", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-intent-type-"));
  try {
    const result = await FileBuildResult.create(root, join(root, "products"), {
      id: "bld_20260902T100000000Z_0000000001",
      sourcePath: "main.svml",
      targets: ["answer"],
      publication: publicationIntent([{ name: "answer", parameters: { collection: "drafts" } }]),
    });
    await result.sync({
      records: [{ id: "record:answer", type: structuredType, value: (42) }],
      resources: { async open() { throw new Error("unexpected Resource read"); } },
    });
    const output = (await result.read()).outputs.answer;
    assert.deepEqual(output?.type, structuredType);
    assert.equal(output?.publisher, "example.test-product@1");
    assert.deepEqual(output?.publicationParameters, { collection: "drafts" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("published Output names are exact data keys, including JavaScript object names", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-output-names-"));
  const names = ["constructor", "toString", "__proto__"];
  try {
    const result = await FileBuildResult.create(root, join(root, "products"), {
      id: "bld_20260902T100000000Z_0000000001",
      sourcePath: "main.svml",
      targets: names,
      publication: publicationIntent(names.map((name, index) => ({
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
      const output = manifest.outputs[name];
      assert.equal(output?.representation, "inline");
      assert.equal(output?.representation === "inline" ? output.value : undefined, index);
    }

    const repository = new FileBuildResultStore(root, join(root, "products"));
    assert.equal((await repository.resolveProduct({ publication: manifest.id, name: "constructor" }))?.value, 0);
    assert.equal(await repository.resolveProduct({ publication: manifest.id, name: "valueOf" }), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a complete Result requires every published Output", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-completion-"));
  try {
    const result = await FileBuildResult.create(root, join(root, "products"), {
      id: "bld_20260902T100000000Z_0000000001",
      sourcePath: "main.svml",
      targets: ["answer"],
      publication: publicationIntent([{ name: "answer" }]),
    });
    await assert.rejects(result.finish({ outcome: "complete" }), /Products are stored: answer/u);
    assert.equal((await result.read()).outcome, undefined);
    assert.equal((await result.finish({ outcome: "failed", failure: "producer stopped" })).outcome, "failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
