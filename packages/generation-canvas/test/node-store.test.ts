import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createGenerationWorkspace } from "../src/index.js";
import { readGenerationWorkspaceFile, writeGenerationWorkspaceFile } from "../src/node/index.js";

test("the Node store round-trips one Generation Workspace", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-workspace-"));
  try {
    const path = join(directory, "story.workspace.json");
    const workspace = createGenerationWorkspace({ id: "story", name: "Story", graph: { path: "story.graph.json" } });
    await writeGenerationWorkspaceFile(path, workspace);
    assert.deepEqual(await readGenerationWorkspaceFile(path), workspace);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
