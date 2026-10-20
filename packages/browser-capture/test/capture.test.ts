import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withCapture } from "../src/index.js";

test("a missing selected browser refuses capture without using another installed browser", async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), "hypit-capture-empty-cache-"));
  try {
    await assert.rejects(withCapture({ browser: { version: "153.0.8010.12", cacheDirectory } }, async () => {
      assert.fail("a missing selected browser cannot run the task");
    }), /install-browser/u);
    const { readdir } = await import("node:fs/promises");
    assert.deepEqual(await readdir(cacheDirectory), [], "capture does not create an installation");
  } finally { await rm(cacheDirectory, { recursive: true, force: true }); }
});
