import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyGenerationGraphTransaction,
  type GenerationGraphProject,
} from "@hypit/generation-graph";
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
  adoptBuildOutputInGenerationCanvas,
  openNodeGenerationCanvas,
  placeAcceptedBuildInGenerationCanvas,
  placeBuildOutputInGenerationCanvas,
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

test("one exact output selected from History can be placed without copying Result state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-canvas-history-"));
  try {
    const canvasPath = join(directory, "storyboard.canvas.json");
    const initial = viewWithGraphNodes();
    await writeGenerationCanvasViewFile(canvasPath, initial);
    const placed = await placeBuildOutputInGenerationCanvas({
      canvasPath,
      revision: initial.revision,
      address: { build: "Build-History", output: "image" },
      placement: { id: "history-image", x: 220, y: 420 },
    });
    const historyProduct = product("Build-History", "image", "image/png");
    const observations = await observeGenerationCanvasBuildOutputs(placed, {
      async readResult(build) {
        assert.equal(build, "Build-History");
        return {
          format: "hypit.build-result@1",
          id: build,
          sourcePath: "storyboard.graph.json",
          targets: ["image"],
          outputs: { image: historyProduct },
          outcome: "complete",
          finishedAt: 1,
        };
      },
    });
    const saved = await readGenerationCanvasViewFile(canvasPath);

    assert.deepEqual(saved, placed);
    assert.deepEqual(saved.items.at(-1), {
      id: "history-image",
      subject: { kind: "build-output", build: "Build-History", output: "image" },
      x: 220,
      y: 420,
    });
    assert.deepEqual(observations, [{
      build: "Build-History",
      output: "image",
      state: "ready",
      product: historyProduct,
    }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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

test("adopting a completed card authors one value node and replaces it in place", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-canvas-adopt-"));
  try {
    const graphPath = join(directory, "storyboard.graph.json");
    const canvasPath = join(directory, "storyboard.canvas.json");
    const { readGenerationGraphProjectFile, writeGenerationGraphProjectFile } =
      await import("@hypit/generation-graph/node");
    await writeGenerationGraphProjectFile(graphPath, graph);
    const initial = viewWithGraphNodes();
    const placed = applyGenerationCanvasTransaction(initial, planAcceptedGenerationCanvasBuild(initial, {
      build: "Build-A",
      outputs: ["image"],
    }, [{ id: "result-a-image", output: "image", x: 100, y: 320 }]));
    await writeGenerationCanvasViewFile(canvasPath, placed);

    const adopted = await adoptBuildOutputInGenerationCanvas({
      canvasPath,
      canvasRevision: placed.revision,
      graphRevision: graph.revision,
      item: "result-a-image",
      node: "adopted-image",
      graphCommands: [{ kind: "node.replace", node: {
        ...graph.nodes[1]!,
        inputs: { image: { node: "adopted-image" } },
      } }],
      async materialize(context) {
        assert.deepEqual(context.product, { publication: "Build-A", name: "image" });
        return {
          id: context.node,
          using: { module: { name: "@hypit/media-asset", version: "1" }, name: "resource" },
          inputs: { asset: { value: { path: "assets/adopted.media.json" } } },
        };
      },
    });
    const savedGraph = await readGenerationGraphProjectFile(graphPath);
    const savedView = await readGenerationCanvasViewFile(canvasPath);
    const replacement = savedView.items.find((item) => item.id === "result-a-image");

    assert.equal(adopted.graph.revision, graph.revision + 1);
    assert.deepEqual(savedGraph, adopted.graph);
    assert.deepEqual(savedView, adopted.view);
    assert.deepEqual(replacement, {
      id: "result-a-image",
      subject: { kind: "graph-node", node: "adopted-image" },
      x: 100,
      y: 320,
    });
    assert.deepEqual(savedGraph.nodes.find((node) => node.id === "video")?.inputs,
      { image: { node: "adopted-image" } });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("adoption does not overwrite a Graph edit made while the Product is materialized", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-canvas-graph-conflict-"));
  try {
    const graphPath = join(directory, "storyboard.graph.json");
    const canvasPath = join(directory, "storyboard.canvas.json");
    const { readGenerationGraphProjectFile, writeGenerationGraphProjectFile } =
      await import("@hypit/generation-graph/node");
    await writeGenerationGraphProjectFile(graphPath, graph);
    const initial = viewWithGraphNodes();
    const placed = applyGenerationCanvasTransaction(initial, planAcceptedGenerationCanvasBuild(initial, {
      build: "Build-A", outputs: ["image"],
    }, [{ id: "result-a-image", output: "image", x: 100, y: 320 }]));
    await writeGenerationCanvasViewFile(canvasPath, placed);

    await assert.rejects(adoptBuildOutputInGenerationCanvas({
      canvasPath,
      canvasRevision: placed.revision,
      graphRevision: graph.revision,
      item: "result-a-image",
      node: "adopted-image",
      async materialize(context) {
        await writeGenerationGraphProjectFile(graphPath, applyGenerationGraphTransaction(graph, {
          revision: graph.revision,
          commands: [{ kind: "project.rename", name: "Edited while importing" }],
        }));
        return {
          id: context.node,
          using: { module: { name: "@hypit/media-asset", version: "1" }, name: "resource" },
          inputs: { asset: { value: { path: "assets/adopted.media.json" } } },
        };
      },
    }), /expected revision 2, found 3/u);

    const savedGraph = await readGenerationGraphProjectFile(graphPath);
    assert.equal(savedGraph.name, "Edited while importing");
    assert.equal(savedGraph.nodes.some((node) => node.id === "adopted-image"), false);
    assert.deepEqual(await readGenerationCanvasViewFile(canvasPath), placed);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("adoption does not overwrite a Canvas edit made while the Product is materialized", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-canvas-view-conflict-"));
  try {
    const graphPath = join(directory, "storyboard.graph.json");
    const canvasPath = join(directory, "storyboard.canvas.json");
    const { readGenerationGraphProjectFile, writeGenerationGraphProjectFile } =
      await import("@hypit/generation-graph/node");
    await writeGenerationGraphProjectFile(graphPath, graph);
    const initial = viewWithGraphNodes();
    const placed = applyGenerationCanvasTransaction(initial, planAcceptedGenerationCanvasBuild(initial, {
      build: "Build-A", outputs: ["image"],
    }, [{ id: "result-a-image", output: "image", x: 100, y: 320 }]));
    await writeGenerationCanvasViewFile(canvasPath, placed);
    const moved = applyGenerationCanvasTransaction(placed, {
      revision: placed.revision,
      commands: [{ kind: "item.move", id: "result-a-image", x: 240, y: 440 }],
    });

    await assert.rejects(adoptBuildOutputInGenerationCanvas({
      canvasPath,
      canvasRevision: placed.revision,
      graphRevision: graph.revision,
      item: "result-a-image",
      node: "adopted-image",
      async materialize(context) {
        await writeGenerationCanvasViewFile(canvasPath, moved);
        return {
          id: context.node,
          using: { module: { name: "@hypit/media-asset", version: "1" }, name: "resource" },
          inputs: { asset: { value: { path: "assets/adopted.media.json" } } },
        };
      },
    }), new RegExp(`expected revision ${placed.revision}, found ${moved.revision}`, "u"));

    assert.deepEqual(await readGenerationCanvasViewFile(canvasPath), moved);
    assert.deepEqual(await readGenerationGraphProjectFile(graphPath), graph);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
