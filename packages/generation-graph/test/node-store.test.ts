import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyGenerationGraphTransaction,
  createGenerationGraphProject,
} from "../src/index.js";
import {
  readGenerationGraphProjectFile,
  writeGenerationGraphProjectFile,
} from "../src/node/index.js";

test("the Node store persists only author recipes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-graph-"));
  try {
    const path = join(directory, "images.graph.json");
    const project = applyGenerationGraphTransaction(
      createGenerationGraphProject({ id: "images", name: "Images" }),
      { revision: 0, commands: [{ kind: "node.add", node: {
        id: "hero",
        using: { module: { name: "@example/image" }, name: "generate" },
        inputs: { prompt: { value: "hero" } },
      } }] },
    );
    await writeGenerationGraphProjectFile(path, project);
    assert.deepEqual(await readGenerationGraphProjectFile(path), project);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
