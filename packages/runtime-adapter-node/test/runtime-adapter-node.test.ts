import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  diagnoseRuntimeExecutable,
  resolveRuntimeExecutable,
} from "@svml/runtime-adapter-node";

test("configured executable paths are rooted at the Runtime Profile project", async () => {
  const root = await mkdtemp(join(tmpdir(), "svml-runtime-adapter-node-"));
  try {
    const path = join(root, "tools", "fixture");
    await mkdir(join(root, "tools"), { recursive: true });
    await writeFile(path, "#!/bin/sh\n", "utf8");
    await chmod(path, 0o755);
    assert.equal(resolveRuntimeExecutable(root, "./tools/fixture"), path);
    assert.deepEqual(await diagnoseRuntimeExecutable({
      root,
      configured: "./tools/fixture",
      fallback: "unused",
      subject: "fixture",
    }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
