import type {
  GenerationGraphCommand,
  GenerationGraphNode,
  GenerationGraphProject,
  GenerationGraphTransaction,
} from "@hypit/generation-graph";

import type {
  GenerationCanvasTransaction,
} from "./transaction.js";
import type { GenerationCanvasView } from "./types.js";

export type GenerationCanvasBuildOutputAdoptionPlan = {
  readonly graph: GenerationGraphTransaction;
  readonly canvas: GenerationCanvasTransaction;
};

/**
 * Replace one exact Result card with its already-materialized authored value node.
 * Product Type owners create the node; this layer only coordinates ordinary document transactions.
 */
export function planGenerationCanvasBuildOutputAdoption(input: {
  readonly graph: GenerationGraphProject;
  readonly canvas: GenerationCanvasView;
  readonly item: string;
  readonly node: GenerationGraphNode;
  /** Optional author edits, such as connecting the new value node to an existing operation node. */
  readonly graphCommands?: readonly GenerationGraphCommand[];
}): GenerationCanvasBuildOutputAdoptionPlan {
  const item = input.canvas.items.find((candidate) => candidate.id === input.item);
  if (item === undefined) throw new Error(`Unknown Generation Canvas Item: ${input.item}`);
  if (item.subject.kind !== "build-output") {
    throw new Error(`Generation Canvas Item ${input.item} is not a Build output.`);
  }
  if (input.graph.nodes.some((candidate) => candidate.id === input.node.id)) {
    throw new Error(`Generation Graph Node ${input.node.id} already exists.`);
  }
  if (Object.values(input.node.inputs).some((value) => "node" in value)) {
    throw new Error("An adopted Product must become an authored value node without recipe dependencies.");
  }
  return {
    graph: {
      revision: input.graph.revision,
      commands: [
        { kind: "node.add", node: structuredClone(input.node) },
        ...(input.graphCommands ?? []).map((command) => structuredClone(command)),
      ],
    },
    canvas: {
      revision: input.canvas.revision,
      commands: [{ kind: "item.replace", item: {
        ...item,
        subject: { kind: "graph-node", node: input.node.id },
      } }],
    },
  };
}
