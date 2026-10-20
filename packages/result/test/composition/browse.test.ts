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
      source: { id: "/project/main.svml" },
      publication: publication([
        { name: "video", output: "logical:video" },
        { name: "duplicate", output: "logical:video" },
      ], ["video"]),
    }), /has more than one published name/u);

    for (const id of ids) {
      const writer = await repository.create({
        id,
        source: { id: "/project/main.svml" },
        publication: publication([{ name: "video", output: "logical:video" }], ["video"]),
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
