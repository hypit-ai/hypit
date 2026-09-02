import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildResultDirectory, FileBuildResultRepository } from "@hypit/build-result";

import { migrateFlatBuildResults } from "../src/migrate.js";

test("the explicit filesystem migration moves one flat Result into its date bucket", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-flat-result-migration-"));
  const build = "bld_20260902T100000000Z_0000000001";
  const flat = join(root, build);
  try {
    await mkdir(flat);
    await writeFile(join(flat, "result.json"), `${JSON.stringify({
      format: "hypit.build-result@2",
      source: { path: "main.svml" },
      targets: [],
      outcome: "complete",
      finishedAt: 1,
      outputs: {},
    })}\n`);

    assert.deepEqual(await migrateFlatBuildResults(root), [build]);
    assert.equal(await stat(flat).then(() => true, () => false), false);
    assert.equal(JSON.parse(await readFile(join(buildResultDirectory(root, build), "result.json"), "utf8")).format,
      "hypit.build-result@2");
    assert.equal((await new FileBuildResultRepository(root).read(build))?.id, build);
    assert.deepEqual(await migrateFlatBuildResults(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
