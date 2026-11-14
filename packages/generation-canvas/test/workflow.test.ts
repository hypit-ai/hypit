import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGenerationWorkspaceTransaction,
  createGenerationWorkspace,
  observeGenerationWorkspaceOutputs,
  planAcceptedGenerationWorkspaceBuild,
  projectGenerationCanvas,
} from "../src/index.js";
import { createGenerationGraphProject, applyGenerationGraphTransaction } from "@hypit/generation-graph";

test("accepted outputs attach and become the producing nodes' selected reuse boundaries", async () => {
  const graph = applyGenerationGraphTransaction(
    createGenerationGraphProject({ id: "images", name: "Images" }),
    { revision: 0, commands: [{ kind: "node.add", node: {
      id: "hero",
      using: { module: { name: "@example/image" }, name: "image" },
      inputs: { prompt: { value: "A glass city" } },
    } }] },
  );
  const placed = applyGenerationWorkspaceTransaction(
    createGenerationWorkspace({ id: "images", name: "Images", graph: { path: "images.graph.json" } }),
    { revision: 0, commands: [{ kind: "node.add", node: { node: "hero", name: "Hero", x: 20, y: 40 } }] },
  );
  const attached = applyGenerationWorkspaceTransaction(placed,
    planAcceptedGenerationWorkspaceBuild(placed, { build: "Build-A", outputs: ["hero"] }));
  assert.deepEqual(attached.nodes[0]?.selected, { build: "Build-A", output: "hero" });
  const observations = await observeGenerationWorkspaceOutputs(attached, {
    async readResult(build) {
      return {
        format: "hypit.build-result@1",
        id: build,
        sourcePath: "images.graph.json",
        targets: ["hero"],
        outcome: "complete",
        finishedAt: 1,
        outputs: { hero: {
          address: { publication: build, name: "hero" },
          type: { module: { name: "@example/image" }, name: "Image" },
          publisher: "hypit.product@1",
          representation: "file",
          mediaType: "image/png",
          size: 8,
        } },
      };
    },
  });
  const scene = projectGenerationCanvas(graph, attached, observations);
  assert.equal(scene.items[0]?.name, "Hero");
  assert.deepEqual(scene.nodeTypes[0], { node: "hero", displayName: "image", role: "generic" });
  assert.equal(scene.items[0]?.outputs[0]?.state, "ready");
  assert.equal(scene.items[0]?.selectedObservation?.state, "ready");
  assert.equal(Object.hasOwn(attached, "status"), false);
});
