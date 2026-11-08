import { dirname, resolve } from "node:path";

import { readGenerationGraphProjectFile } from "@hypit/generation-graph/node";

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
