import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { GenerationGraphProject } from "@hypit/generation-graph";
import type { Product } from "@hypit/product";
import type { BuildResult } from "@hypit/result";

import {
  applyGenerationCanvasTransaction,
  createGenerationCanvasView,
  observeGenerationCanvasBuildOutputs,
  planAcceptedGenerationCanvasBuild,
  projectGenerationCanvas,
  type GenerationCanvasView,
} from "../src/index.js";
import {
  openNodeGenerationCanvas,
  placeAcceptedBuildInGenerationCanvas,
  readGenerationCanvasViewFile,
  writeGenerationCanvasViewFile,
} from "../src/node/index.js";

const graph: GenerationGraphProject = {
  format: "hypit.generation-graph@1",
  id: "storyboard",
  name: "Storyboard",
  revision: 2,
  nodes: [{
    id: "image",
    using: { module: { name: "@example/image", version: "1" }, name: "generate" },
    inputs: { prompt: { value: "A glass city" } },
  }, {
    id: "video",
    using: { module: { name: "@example/video", version: "1" }, name: "generate" },
    inputs: { image: { node: "image" } },
  }],
};

function viewWithGraphNodes(): GenerationCanvasView {
  return applyGenerationCanvasTransaction(createGenerationCanvasView({
    id: "storyboard-main",
    name: "Storyboard",
    graph: { path: "storyboard.graph.json" },
  }), {
    revision: 0,
    commands: [{ kind: "item.add", item: {
      id: "node-image",
      subject: { kind: "graph-node", node: "image" },
      x: 100,
      y: 100,
    } }, { kind: "item.add", item: {
      id: "node-video",
      subject: { kind: "graph-node", node: "video" },
      x: 500,
      y: 100,
    } }],
  });
}

function product(build: string, output: string, mediaType: string): Product {
  return {
    address: { publication: build, name: output },
    type: { module: { name: "@hypit/blob", version: "1" }, name: "Blob" },
    publisher: "hypit.product@1",
    representation: "file",
    mediaType,
    size: 4,
  };
}

test("an accepted Build becomes persistent cards and projects active execution", async () => {
  const initial = viewWithGraphNodes();
  const transaction = planAcceptedGenerationCanvasBuild(initial, {
    build: "Build-A",
    outputs: ["image", "video"],
  }, [{ id: "result-a-image", output: "image", x: 100, y: 320 }, {
    id: "result-a-video", output: "video", x: 500, y: 320,
  }]);
  const placed = applyGenerationCanvasTransaction(initial, transaction);
  let inspections = 0;
  const observations = await observeGenerationCanvasBuildOutputs(placed, {
    async inspectActive(build) {
      inspections += 1;
      return { id: build, activity: "running", outputs: { image: product(build, "image", "image/png") } };
    },
    async readResult() {
      throw new Error("Active Build must not read finished history.");
    },
  });
  const scene = projectGenerationCanvas(graph, placed, observations);

  assert.equal(inspections, 1);
  assert.deepEqual(observations.map((item) => [item.output, item.state]), [
    ["image", "ready"],
    ["video", "running"],
  ]);
  assert.deepEqual(scene.edges, [{ kind: "recipe", from: "node-image", to: "node-video", input: "image" }, {
    kind: "produced-by", from: "node-image", to: "result-a-image",
  }, {
    kind: "produced-by", from: "node-video", to: "result-a-video",
  }]);
});

test("reopening the Canvas restores finished and failed outputs from history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-canvas-refresh-"));
  try {
    const canvasPath = join(directory, "storyboard.canvas.json");
    const initial = viewWithGraphNodes();
    const placed = applyGenerationCanvasTransaction(initial, planAcceptedGenerationCanvasBuild(initial, {
      build: "Build-A",
      outputs: ["image", "video"],
    }, [{ id: "result-a-image", output: "image", x: 100, y: 320 }, {
      id: "result-a-video", output: "video", x: 500, y: 320,
    }]));
    await writeGenerationCanvasViewFile(canvasPath, placed);

    const reopened = await readGenerationCanvasViewFile(canvasPath);
    const result: BuildResult = {
      format: "hypit.build-result@1",
      id: "Build-A",
      sourcePath: "storyboard.graph.json",
      targets: ["video"],
      outputs: { image: product("Build-A", "image", "image/png") },
      outcome: "failed",
      finishedAt: 1,
      failure: "Video generation failed",
    };
    const observations = await observeGenerationCanvasBuildOutputs(reopened, {
      async readResult(build) {
        return build === result.id ? result : undefined;
      },
    });
    const scene = projectGenerationCanvas(graph, reopened, observations);

    assert.deepEqual(observations.map((item) => [item.output, item.state]), [
      ["image", "ready"],
      ["video", "failed"],
    ]);
    assert.equal(scene.items.length, 4);
    assert.equal(reopened.revision, placed.revision);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the accepted receipt and placement must describe the same outputs", () => {
  const view = viewWithGraphNodes();
  assert.throws(() => planAcceptedGenerationCanvasBuild(view, {
    build: "Build-A",
    outputs: ["image", "video"],
  }, [{ id: "result-a-image", output: "image", x: 0, y: 0 }]), /exactly once/u);
});

test("the Node Host places an accepted receipt and reopens the complete scene", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-canvas-host-"));
  try {
    const graphPath = join(directory, "storyboard.graph.json");
    const canvasPath = join(directory, "storyboard.canvas.json");
    const { writeGenerationGraphProjectFile } = await import("@hypit/generation-graph/node");
    await writeGenerationGraphProjectFile(graphPath, graph);
    const initial = viewWithGraphNodes();
    await writeGenerationCanvasViewFile(canvasPath, initial);
    const placed = await placeAcceptedBuildInGenerationCanvas({
      canvasPath,
      revision: initial.revision,
      accepted: { build: "Build-A", outputs: ["image", "video"] },
      placements: [{ id: "result-a-image", output: "image", x: 100, y: 320 }, {
        id: "result-a-video", output: "video", x: 500, y: 320,
      }],
    });
    const opened = await openNodeGenerationCanvas({
      canvasPath,
      observations: {
        async inspectActive(build) { return { id: build, activity: "waiting" }; },
        async readResult() { return undefined; },
      },
    });

    assert.equal(placed.revision, initial.revision + 1);
    assert.equal(opened.view.revision, placed.revision);
    assert.equal(opened.graphPath, graphPath);
    assert.deepEqual(opened.observations.map((item) => item.state), ["running", "running"]);
    assert.equal(opened.scene.edges.length, 3);
    await assert.rejects(placeAcceptedBuildInGenerationCanvas({
      canvasPath,
      revision: initial.revision,
      accepted: { build: "Build-B", outputs: ["image"] },
      placements: [{ id: "result-b-image", output: "image", x: 100, y: 520 }],
    }), /expected revision 1, found 2/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
