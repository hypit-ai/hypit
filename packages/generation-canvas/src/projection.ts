import { assertGenerationGraphProject, type GenerationGraphProject } from "@hypit/generation-graph";

import { assertGenerationWorkspace } from "./project.js";
import {
  generationWorkspaceBuildOutputKey,
  type GenerationWorkspaceOutputObservation,
} from "./observation.js";
import type { GenerationWorkspace, GenerationWorkspaceOutputAddress } from "./types.js";
import type { GenerationCanvasNodeRole, GenerationCanvasPresentationHost } from "./presentation.js";
import type { GenerationNodeAuthoringHost } from "@hypit/generation-graph";
import type { GenerationCanvasNodeEditor } from "./presentation.js";

export type GenerationCanvasSceneItem = {
  readonly id: string;
  readonly kind: "graph-node";
  readonly node: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly available: boolean;
  readonly selected?: GenerationWorkspaceOutputAddress;
  readonly selectedObservation?: GenerationWorkspaceOutputObservation;
  readonly outputs: readonly GenerationWorkspaceOutputObservation[];
  readonly presentation: {
    readonly displayName: string;
    readonly role: GenerationCanvasNodeRole;
    readonly category?: "image" | "video" | "audio" | "asset";
    readonly summaryInput?: string;
    readonly modelLabel?: string;
    readonly modelGroup?: string;
    readonly editor?: GenerationCanvasNodeEditor;
  };
};

export type GenerationCanvasSceneEdge = {
  readonly kind: "recipe";
  readonly from: string;
  readonly to: string;
  readonly input: string;
};

export type GenerationCanvasSceneNodeType = {
  readonly node: string;
  readonly displayName: string;
  readonly role: GenerationCanvasNodeRole;
  readonly category?: "image" | "video" | "audio" | "asset";
  readonly summaryInput?: string;
  readonly modelLabel?: string;
  readonly modelGroup?: string;
  readonly editor?: GenerationCanvasNodeEditor;
};

export type GenerationCanvasScene = {
  readonly nodeTypes: readonly GenerationCanvasSceneNodeType[];
  readonly items: readonly GenerationCanvasSceneItem[];
  readonly edges: readonly GenerationCanvasSceneEdge[];
};

/** Join recipe, Workspace author choices and invocation-local observations. */
export function projectGenerationCanvas(
  graph: GenerationGraphProject,
  workspace: GenerationWorkspace,
  observations: readonly GenerationWorkspaceOutputObservation[] = [],
  presentations?: GenerationCanvasPresentationHost,
  authorings?: GenerationNodeAuthoringHost,
): GenerationCanvasScene {
  assertGenerationGraphProject(graph);
  assertGenerationWorkspace(workspace);
  const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodeTypes = graph.nodes.map((node): GenerationCanvasSceneNodeType => {
    const presentation = presentations?.resolve(node);
    const authoring = authorings?.resolveAuthoring(node);
    const editor = authoring === undefined ? undefined : {
      ...structuredClone(authoring),
      labels: structuredClone(presentation?.authoring ?? {}),
    };
    return presentation === undefined
      ? { node: node.id, displayName: node.using.name, role: "generic" }
      : {
          node: node.id,
          displayName: presentation.displayName,
          role: presentation.role,
          ...(presentation.category === undefined ? {} : { category: presentation.category }),
          ...(presentation.summaryInput === undefined ? {} : { summaryInput: presentation.summaryInput }),
          ...(presentation.modelLabel === undefined ? {} : { modelLabel: presentation.modelLabel }),
          ...(presentation.modelGroup === undefined ? {} : { modelGroup: presentation.modelGroup }),
          ...(editor === undefined ? {} : { editor }),
        };
  });
  const nodeTypesByNode = new Map(nodeTypes.map((item) => [item.node, item]));
  const observed = new Map(observations.map((item) => [generationWorkspaceBuildOutputKey(item.build, item.output), item]));
  if (observed.size !== observations.length) throw new Error("Generation Workspace observations repeat one Build output.");
  const attached = new Map<string, GenerationWorkspaceOutputObservation[]>();
  for (const output of workspace.outputs) {
    const observation = observed.get(generationWorkspaceBuildOutputKey(output.build, output.output)) ?? {
      build: output.build,
      output: output.output,
      state: "unavailable" as const,
    };
    const items = attached.get(output.node) ?? [];
    items.push(observation);
    attached.set(output.node, items);
  }
  const items = workspace.nodes.map((item): GenerationCanvasSceneItem => {
    const outputs = attached.get(item.node) ?? [];
    const selectedObservation = item.selected === undefined ? undefined
      : observed.get(generationWorkspaceBuildOutputKey(item.selected.build, item.selected.output)) ?? outputs.find((output) =>
        output.build === item.selected?.build && output.output === item.selected.output);
    const node = graphNodes.get(item.node);
    const presentation = nodeTypesByNode.get(item.node);
    return {
      id: item.node,
      kind: "graph-node",
      node: item.node,
      name: item.name,
      x: item.x,
      y: item.y,
      available: graphNodes.has(item.node),
      outputs,
      presentation: presentation === undefined
        ? { displayName: "Missing node", role: "generic" }
        : {
            displayName: presentation.displayName,
            role: presentation.role,
            ...(presentation.category === undefined ? {} : { category: presentation.category }),
            ...(presentation.summaryInput === undefined ? {} : { summaryInput: presentation.summaryInput }),
            ...(presentation.modelLabel === undefined ? {} : { modelLabel: presentation.modelLabel }),
            ...(presentation.modelGroup === undefined ? {} : { modelGroup: presentation.modelGroup }),
            ...(presentation.editor === undefined ? {} : { editor: structuredClone(presentation.editor) }),
          },
      ...(item.selected === undefined ? {} : { selected: structuredClone(item.selected) }),
      ...(selectedObservation === undefined ? {} : { selectedObservation }),
    };
  });
  const placed = new Set(workspace.nodes.map((item) => item.node));
  const edges: GenerationCanvasSceneEdge[] = [];
  for (const node of graph.nodes) {
    if (!placed.has(node.id)) continue;
    for (const [input, binding] of Object.entries(node.inputs)) {
      if ("node" in binding && placed.has(binding.node)) {
        edges.push({ kind: "recipe", from: binding.node, to: node.id, input });
      }
    }
  }
  return { nodeTypes, items, edges };
}
