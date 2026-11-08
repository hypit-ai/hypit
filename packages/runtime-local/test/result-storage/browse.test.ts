import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileBuildFinalizationStore } from "../../src/result-storage/index.js";
import { FileBuildResultHistory } from "@hypit/result/node";

import {
  publicationIntent,
} from "./repository-scenario.js";

test("filesystem Build history records one Product address per Output and browses newest first", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-build-result-browse-"));
  const finalization = new FileBuildFinalizationStore(root, join(root, "products"));
  const history = new FileBuildResultHistory(root);
  const ids = [
    "bld_20260901T100000001Z_0000000001",
    "bld_20260902T100000002Z_0000000001",
    "bld_20260903T100000003Z_0000000001",
  ];
  try {
    await assert.rejects(finalization.create({
      id: "bld_20260902T100000000Z_0000000001",
      sourcePath: "/project/main.svml",
      targets: ["video"],
      publication: publicationIntent([
        { name: "video", record: "record:video" },
        { name: "video", record: "record:duplicate" },
      ]),
    }), /name video is repeated/u);

    for (const id of ids) {
      const writer = await finalization.create({
        id,
        sourcePath: "/project/main.svml",
        targets: ["video"],
        publication: publicationIntent([{ name: "video" }]),
      });
      await writer.finish({ outcome: "failed", failure: "ordering fixture" });
    }
    assert.deepEqual(await readdir(root), ["2026-09-01", "2026-09-02", "2026-09-03", "products"]);

    const first = await history.browse({ limit: 2 });
    assert.deepEqual(first.results.map((item) => item.id), [ids[2], ids[1]]);
    assert.equal(first.next, ids[1]);
    if (first.next === undefined) throw new Error("expected an older Result cursor");
    const second = await history.browse({ limit: 2, before: first.next });
    assert.deepEqual(second.results.map((item) => item.id), [ids[0]]);
    assert.equal(second.next, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
