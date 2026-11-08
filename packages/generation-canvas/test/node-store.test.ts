import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createGenerationCanvasView } from "../src/index.js";
import {
  readGenerationCanvasViewFile,
  writeGenerationCanvasViewFile,
} from "../src/node/index.js";

test("the Node store atomically persists one Canvas View", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-canvas-"));
  try {
    const path = join(directory, "storyboard.canvas.json");
    const view = createGenerationCanvasView({
      id: "storyboard-main",
      name: "Storyboard",
      graph: { path: "storyboard.graph.json" },
    });
    await writeGenerationCanvasViewFile(path, view);
    assert.deepEqual(await readGenerationCanvasViewFile(path), view);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
