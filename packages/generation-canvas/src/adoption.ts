import type {
  GenerationGraphCommand,
  GenerationGraphNode,
  GenerationGraphProject,
  GenerationGraphTransaction,
} from "@hypit/generation-graph";

import type { GenerationWorkspace, GenerationWorkspaceOutputAddress } from "./types.js";
import type { GenerationWorkspaceTransaction } from "./transaction.js";
import { generationWorkspaceOutputKey } from "./types.js";

export type GenerationWorkspaceOutputAdoptionPlan = {
  readonly graph: GenerationGraphTransaction;
  readonly workspace: GenerationWorkspaceTransaction;
};

/** Promote one exact Product into a new authored value node while retaining its result history. */
export function planGenerationWorkspaceOutputAdoption(input: {
  readonly graph: GenerationGraphProject;
  readonly workspace: GenerationWorkspace;
  readonly output: GenerationWorkspaceOutputAddress;
  readonly node: GenerationGraphNode;
  readonly name: string;
  readonly placement: { readonly x: number; readonly y: number };
  readonly graphCommands?: readonly GenerationGraphCommand[];
}): GenerationWorkspaceOutputAdoptionPlan {
  const output = input.workspace.outputs.find((candidate) =>
    generationWorkspaceOutputKey(candidate) === generationWorkspaceOutputKey(input.output));
  if (output === undefined) throw new Error(`Unknown Generation Workspace Output: ${input.output.build}/${input.output.output}`);
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
    workspace: {
      revision: input.workspace.revision,
      commands: [{ kind: "node.add", node: {
        node: input.node.id,
        name: input.name,
        x: input.placement.x,
        y: input.placement.y,
      } }],
    },
  };
}
