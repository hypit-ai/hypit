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
  commitAcceptedGenerationGraphBuild,
  readGenerationGraphProjectFile,
  readGenerationNodeProductFile,
  writeGenerationGraphProjectFile,
} from "../src/node/index.js";

test("accepted Runtime work publishes sidecars before selecting them in the project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-graph-"));
  try {
    const path = join(directory, "images.graph.json");
    const original = applyGenerationGraphTransaction(
      createGenerationGraphProject({ id: "images", name: "Images" }),
      { revision: 0, commands: [{ kind: "node.add", node: {
        id: "hero",
        using: { module: { name: "@example/image", version: "1" }, name: "generate" },
        inputs: { prompt: { value: "hero" } },
        products: [],
        selected: "generate",
      } }] },
    );
    await writeGenerationGraphProjectFile(path, original);
    const productPath = "./products/hero/bld_fixture.json";
    const updated = await commitAcceptedGenerationGraphBuild(path, {
      build: "bld_fixture",
      products: [{
        node: "hero",
        path: productPath,
        document: { format: "hypit.node-product@1", build: "bld_fixture", output: "hero" },
      }],
      transaction: { revision: 1, commands: [
        { kind: "node.product.add", id: "hero", path: productPath },
        { kind: "node.select", id: "hero", selected: productPath },
      ] },
    });
    assert.equal(updated.nodes[0]?.selected, productPath);
    assert.deepEqual(await readGenerationGraphProjectFile(path), updated);
    assert.deepEqual(await readGenerationNodeProductFile(join(directory, "products/hero/bld_fixture.json")), {
      format: "hypit.node-product@1",
      build: "bld_fixture",
      output: "hero",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
