import { dirname, resolve } from "node:path";

import {
  applyGenerationGraphTransaction,
  GenerationGraphRevisionConflict,
  type GenerationGraphCommand,
  type GenerationGraphNode,
} from "@hypit/generation-graph";
import {
  readGenerationGraphProjectFile,
  writeGenerationGraphProjectFile,
} from "@hypit/generation-graph/node";
import type { ProductAddress } from "@hypit/product";

import {
  observeGenerationCanvasBuildOutputs,
  type GenerationCanvasBuildOutputObservation,
  type GenerationCanvasObservationHost,
} from "../observation.js";
import {
  planAcceptedGenerationCanvasBuild,
  type AcceptedGenerationCanvasBuild,
  type GenerationCanvasBuildOutputPlacement,
} from "../accepted-build.js";
import { planGenerationCanvasBuildOutputAdoption } from "../adoption.js";
import {
  projectGenerationCanvas,
  type GenerationCanvasScene,
} from "../projection.js";
import {
  applyGenerationCanvasTransaction,
  GenerationCanvasRevisionConflict,
} from "../transaction.js";
import type { GenerationCanvasView } from "../types.js";
import {
  readGenerationCanvasViewFile,
  writeGenerationCanvasViewFile,
} from "./store.js";

export type OpenedNodeGenerationCanvas = {
  readonly canvasPath: string;
  readonly graphPath: string;
  readonly graph: import("@hypit/generation-graph").GenerationGraphProject;
  readonly view: GenerationCanvasView;
  readonly observations: readonly GenerationCanvasBuildOutputObservation[];
  readonly scene: GenerationCanvasScene;
};

export type GenerationCanvasProductMaterializationContext = {
  readonly product: ProductAddress;
  readonly node: string;
  readonly graphPath: string;
  readonly canvasPath: string;
};

export type AdoptedNodeGenerationCanvasBuildOutput = {
  readonly graph: import("@hypit/generation-graph").GenerationGraphProject;
  readonly view: GenerationCanvasView;
  readonly node: GenerationGraphNode;
};

/** Open one complete headless Canvas projection from ordinary files and replaceable observation ports. */
export async function openNodeGenerationCanvas(input: {
  readonly canvasPath: string;
  readonly observations: GenerationCanvasObservationHost;
}): Promise<OpenedNodeGenerationCanvas> {
  const canvasPath = resolve(input.canvasPath);
  const view = await readGenerationCanvasViewFile(canvasPath);
  const graphPath = resolve(dirname(canvasPath), view.graph.path);
  const [graph, observations] = await Promise.all([
    readGenerationGraphProjectFile(graphPath),
    observeGenerationCanvasBuildOutputs(view, input.observations),
  ]);
  return {
    canvasPath,
    graphPath,
    graph,
    view,
    observations,
    scene: projectGenerationCanvas(graph, view, observations),
  };
}

/** Persist cards only after a Build is durably accepted. History remains authoritative if this write fails. */
export async function placeAcceptedBuildInGenerationCanvas(input: {
  readonly canvasPath: string;
  readonly revision: number;
  readonly accepted: AcceptedGenerationCanvasBuild;
  readonly placements: readonly GenerationCanvasBuildOutputPlacement[];
}): Promise<GenerationCanvasView> {
  const view = await readGenerationCanvasViewFile(input.canvasPath);
  if (view.revision !== input.revision) {
    throw new GenerationCanvasRevisionConflict(input.revision, view.revision);
  }
  const next = applyGenerationCanvasTransaction(
    view,
    planAcceptedGenerationCanvasBuild(view, input.accepted, input.placements),
  );
  await writeGenerationCanvasViewFile(input.canvasPath, next);
  return next;
}

/**
 * Materialize one exact Product through its owner, commit its value node, then replace the Result card in place.
 * Graph is saved first; if the View save fails, the authored node remains recoverable instead of becoming hidden.
 */
export async function adoptBuildOutputInGenerationCanvas(input: {
  readonly canvasPath: string;
  readonly canvasRevision: number;
  readonly graphRevision: number;
  readonly item: string;
  readonly node: string;
  readonly graphCommands?: readonly GenerationGraphCommand[];
  readonly materialize: (
    context: GenerationCanvasProductMaterializationContext,
  ) => Promise<GenerationGraphNode>;
}): Promise<AdoptedNodeGenerationCanvasBuildOutput> {
  const canvasPath = resolve(input.canvasPath);
  const initialView = await readGenerationCanvasViewFile(canvasPath);
  if (initialView.revision !== input.canvasRevision) {
    throw new GenerationCanvasRevisionConflict(input.canvasRevision, initialView.revision);
  }
  const item = initialView.items.find((candidate) => candidate.id === input.item);
  if (item === undefined) throw new Error(`Unknown Generation Canvas Item: ${input.item}`);
  if (item.subject.kind !== "build-output") {
    throw new Error(`Generation Canvas Item ${input.item} is not a Build output.`);
  }
  const graphPath = resolve(dirname(canvasPath), initialView.graph.path);
  const initialGraph = await readGenerationGraphProjectFile(graphPath);
  if (initialGraph.revision !== input.graphRevision) {
    throw new GenerationGraphRevisionConflict(input.graphRevision, initialGraph.revision);
  }
  if (initialGraph.nodes.some((candidate) => candidate.id === input.node)) {
    throw new Error(`Generation Graph Node ${input.node} already exists.`);
  }
  const node = await input.materialize({
    product: { publication: item.subject.build, name: item.subject.output },
    node: input.node,
    graphPath,
    canvasPath,
  });
  if (node.id !== input.node) {
    throw new Error(`Product materializer returned Graph Node ${node.id}, expected ${input.node}.`);
  }

  // Materialization is ordinary file I/O and may yield to another author edit. Re-read rather than
  // holding a process lock or writing the snapshots observed before the file task began.
  const view = await readGenerationCanvasViewFile(canvasPath);
  if (view.revision !== input.canvasRevision) {
    throw new GenerationCanvasRevisionConflict(input.canvasRevision, view.revision);
  }
  const currentGraphPath = resolve(dirname(canvasPath), view.graph.path);
  if (currentGraphPath !== graphPath) {
    throw new Error("Generation Canvas Graph path changed while the Product was materialized.");
  }
  const graph = await readGenerationGraphProjectFile(graphPath);
  if (graph.revision !== input.graphRevision) {
    throw new GenerationGraphRevisionConflict(input.graphRevision, graph.revision);
  }
  const plan = planGenerationCanvasBuildOutputAdoption({
    graph,
    canvas: view,
    item: input.item,
    node,
    ...(input.graphCommands === undefined ? {} : { graphCommands: input.graphCommands }),
  });
  const nextGraph = applyGenerationGraphTransaction(graph, plan.graph);
  const nextView = applyGenerationCanvasTransaction(view, plan.canvas);
  await writeGenerationGraphProjectFile(graphPath, nextGraph);
  try {
    await writeGenerationCanvasViewFile(canvasPath, nextView);
  } catch (cause) {
    throw new Error(`Generation Graph Node ${node.id} was saved, but Canvas Item ${input.item} was not replaced.`, {
      cause,
    });
  }
  return { graph: nextGraph, view: nextView, node: structuredClone(node) };
}
