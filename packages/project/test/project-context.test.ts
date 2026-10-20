import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { findProjectRoot } from "../src/index.js";

test("project discovery names a malformed package manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-project-json-"));
  const nested = join(root, "productions", "demo");
  const manifest = join(root, "package.json");
  try {
    await mkdir(nested, { recursive: true });
    await writeFile(manifest, "{ broken");
    await assert.rejects(findProjectRoot({ cwd: nested }), (error: unknown) =>
      error instanceof Error
      && error.message.includes(`Project manifest ${manifest} is not valid JSON`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
