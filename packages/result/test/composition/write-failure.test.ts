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

test("a failed filesystem sync cannot make a later resource inherit stale bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-retry-path-"));
  try {
    const result = await FileBuildResult.create(root, {
      id: "bld_20260924T100000000Z_0000000001",
      sourceId: "/project/main.svml",
      publication: publication(["a", "b", "z"].map((name) => ({ name, output: name })), ["a", "b", "z"]),
    });
    const snapshot = (names: readonly string[]) => acceptedRecords({
      records: names.map((name) => ({ id: name, type: videoType, value: {
        kind: "blob", resource: `res_${name}`, size: 1, mediaType: "video/mp4",
      } })),
      bindings: names.map((name) => ({ output: name, record: name })),
    });
    let fail = true;
    const resources = { async open(blob: BlobRef) {
      if (fail && blob.resource === "res_z") throw new Error("intentional source failure");
      return (async function* () { yield Buffer.from(blob.resource.slice(-1).toUpperCase()); })();
    } };
    await assert.rejects(result.sync({ records: snapshot(["b", "z"]), resources }), /intentional source failure/u);
    assert.deepEqual((await result.read()).outputs, {});
    fail = false;
    await result.sync({ records: snapshot(["a", "b", "z"]), resources });
    const outputs = (await result.read()).outputs;
    for (const name of ["a", "b", "z"]) {
      const value = outputs[name]?.value;
      assert.equal(value?.kind, "build-file");
      if (value?.kind !== "build-file") throw new Error("expected file Output");
      assert.equal(await readFile(join(result.directory, value.path), "utf8"), name.toUpperCase());
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Result writer recovers one numeric cursor across file extensions and the 9999 boundary", async () => {
  const artifact: BlobRef = {
    kind: "blob", resource: "res_new-image", size: 1, mediaType: "image/png",
  };
  const resourcePaths: string[] = [];
  const valuePaths: string[] = [];
  const updated = await syncBuildResultOutputs({
    manifest: {
      format: "hypit.build-result@1",
      id: "bld_20260924T110000000Z_0000000001",
      sourceId: "main.svml",
      targets: ["image"],
      outputs: {},
    },
    writer: {
      resources: { old: "files/file-9999.mp4" },
      values: { old: "values/value-9999.json" },
      publication: publication([{ name: "image", output: "logical:image" }], ["image"]),
    },
    sync: {
      records: acceptedRecords({
        records: [{ id: "record:image", type: videoType, value: ({ artifact }) }],
        bindings: [{ output: "logical:image", record: "record:image" }],
      }),
      resources: { async open() { throw new Error("target owns this test write"); } },
    },
    target: {
      async writeResource(path) { resourcePaths.push(path); },
      async writeValue(path) { valuePaths.push(path); },
    },
  });
  assert.deepEqual(resourcePaths, ["files/file-10000.png"]);
  assert.deepEqual(valuePaths, ["values/value-10000.json"]);
  assert.equal(updated.manifest.outputs.image?.value.kind, "value");
});

test("Result writer bounds resource writes and drains started work before a failure escapes", async () => {
  const artifacts = Array.from({ length: 12 }, (_, index): BlobRef => ({
    kind: "blob", resource: `res_${String(index).padStart(2, "0")}`,
    size: 1, mediaType: "image/png",
  }));
  const input = (target: import("@hypit/result").BuildResultWriteTarget) => syncBuildResultOutputs({
    manifest: {
      format: "hypit.build-result@1" as const,
      id: "bld_20260924T110000001Z_0000000001",
      sourceId: "main.svml",
      targets: ["images"],
      outputs: {},
    },
    writer: {
      resources: {}, values: {},
      publication: publication([{ name: "images", output: "logical:images" }], ["images"]),
    },
    sync: {
      records: acceptedRecords({
        records: [{ id: "record:images", type: videoType, value: (artifacts) }],
        bindings: [{ output: "logical:images", record: "record:images" }],
      }),
      resources: { async open() { throw new Error("target owns this test write"); } },
    },
    target,
  });

  let active = 0;
  let maximum = 0;
  let completed = 0;
  await input({
    async writeResource() {
      active += 1;
      maximum = Math.max(maximum, active);
      try { await delay(2); completed += 1; } finally { active -= 1; }
    },
    async writeValue() {},
  });
  assert.equal(maximum, 4);
  assert.equal(completed, artifacts.length);

  active = 0;
  maximum = 0;
  let started = 0;
  let valueWrites = 0;
  await assert.rejects(input({
    async writeResource(_path, artifact) {
      started += 1;
      active += 1;
      maximum = Math.max(maximum, active);
      try {
        if (artifact.resource === artifacts[0]!.resource) {
          await delay(2);
          throw new Error("intentional resource failure");
        }
        await delay(20);
      } finally { active -= 1; }
    },
    async writeValue() { valueWrites += 1; },
  }), /intentional resource failure/u);
  assert.equal(maximum, 4);
  assert.equal(started, 4, "no queued write starts after the first failure");
  assert.equal(active, 0, "all already-started writes settle before sync rejects");
  assert.equal(valueWrites, 0, "a value document cannot publish before all of its files exist");
});
