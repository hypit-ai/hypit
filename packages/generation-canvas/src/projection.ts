import {
  assertGenerationGraphProject,
  type GenerationGraphProject,
} from "@hypit/generation-graph";

import { assertGenerationCanvasView } from "./project.js";
import {
  generationCanvasBuildOutputKey,
  type GenerationCanvasBuildOutputObservation,
} from "./observation.js";
import type { GenerationCanvasView } from "./types.js";

export type GenerationCanvasSceneItem = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
} & (
  | { readonly kind: "graph-node"; readonly node: string; readonly available: boolean }
  | {
      readonly kind: "build-output";
      readonly build: string;
      readonly output: string;
      readonly observation: GenerationCanvasBuildOutputObservation;
    }
);

export type GenerationCanvasSceneEdge =
  | {
      readonly kind: "recipe";
      readonly from: string;
      readonly to: string;
      readonly input: string;
    }
  | {
      readonly kind: "produced-by";
      readonly from: string;
      readonly to: string;
    };

export type GenerationCanvasScene = {
  readonly items: readonly GenerationCanvasSceneItem[];
  /** Recipe and provenance edges are derived and never persisted in the Canvas View. */
  readonly edges: readonly GenerationCanvasSceneEdge[];
};

/** Join persistent recipe and View facts with invocation-local Build observations. */
export function projectGenerationCanvas(
  graph: GenerationGraphProject,
  view: GenerationCanvasView,
  observations: readonly GenerationCanvasBuildOutputObservation[] = [],
): GenerationCanvasScene {
  assertGenerationGraphProject(graph);
  assertGenerationCanvasView(view);
  const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const observationsByOutput = new Map(observations.map((observation) => [
    generationCanvasBuildOutputKey(observation.build, observation.output),
    observation,
  ]));
  if (observationsByOutput.size !== observations.length) {
    throw new Error("Generation Canvas observations repeat one Build output.");
  }
  const graphItems = new Map<string, string>();
  const items = view.items.map((item): GenerationCanvasSceneItem => {
    if (item.subject.kind === "graph-node") {
      graphItems.set(item.subject.node, item.id);
      return {
        id: item.id,
        kind: "graph-node",
        node: item.subject.node,
        x: item.x,
        y: item.y,
        available: graphNodes.has(item.subject.node),
      };
    }
    const key = generationCanvasBuildOutputKey(item.subject.build, item.subject.output);
    return {
      id: item.id,
      kind: "build-output",
      build: item.subject.build,
      output: item.subject.output,
      x: item.x,
      y: item.y,
      observation: observationsByOutput.get(key) ?? {
        build: item.subject.build,
        output: item.subject.output,
        state: "unavailable",
      },
    };
  });
  const edges: GenerationCanvasSceneEdge[] = [];
  for (const node of graph.nodes) {
    const to = graphItems.get(node.id);
    if (to === undefined) continue;
    for (const [input, binding] of Object.entries(node.inputs)) {
      if (!("node" in binding)) continue;
      const from = graphItems.get(binding.node);
      if (from !== undefined) edges.push({ kind: "recipe", from, to, input });
    }
  }
  for (const item of items) {
    if (item.kind !== "build-output") continue;
    const from = graphItems.get(item.output);
    if (from !== undefined) edges.push({ kind: "produced-by", from, to: item.id });
  }
  return { items, edges };
}
