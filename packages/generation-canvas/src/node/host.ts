import { dirname, resolve } from "node:path";

import {
  applyGenerationGraphTransaction,
  GenerationGraphRevisionConflict,
  type GenerationGraphCommand,
  type GenerationGraphNode,
} from "@hypit/generation-graph";
import { readGenerationGraphProjectFile, writeGenerationGraphProjectFile } from "@hypit/generation-graph/node";
import type { ProductAddress } from "@hypit/product";

import {
  observeGenerationWorkspaceOutputs,
  type GenerationWorkspaceObservationHost,
  type GenerationWorkspaceOutputObservation,
} from "../observation.js";
import {
  planAcceptedGenerationWorkspaceBuild,
  type AcceptedGenerationWorkspaceBuild,
} from "../accepted-build.js";
import { planGenerationWorkspaceOutputAttachment } from "../build-output.js";
import { planGenerationWorkspaceOutputAdoption } from "../adoption.js";
import { projectGenerationCanvas, type GenerationCanvasScene } from "../projection.js";
import {
  applyGenerationWorkspaceTransaction,
  GenerationWorkspaceRevisionConflict,
} from "../transaction.js";
import type {
  GenerationWorkspace,
  GenerationWorkspaceOutput,
  GenerationWorkspaceOutputAddress,
} from "../types.js";
import { readGenerationWorkspaceFile, writeGenerationWorkspaceFile } from "./store.js";

export type OpenedNodeGenerationWorkspace = {
  readonly workspacePath: string;
  readonly graphPath: string;
  readonly graph: import("@hypit/generation-graph").GenerationGraphProject;
  readonly workspace: GenerationWorkspace;
  readonly observations: readonly GenerationWorkspaceOutputObservation[];
  readonly scene: GenerationCanvasScene;
};

export async function openNodeGenerationWorkspace(input: {
  readonly workspacePath: string;
  readonly observations: GenerationWorkspaceObservationHost;
}): Promise<OpenedNodeGenerationWorkspace> {
  const workspacePath = resolve(input.workspacePath);
  const workspace = await readGenerationWorkspaceFile(workspacePath);
  const graphPath = resolve(dirname(workspacePath), workspace.graph.path);
  const [graph, observations] = await Promise.all([
    readGenerationGraphProjectFile(graphPath),
    observeGenerationWorkspaceOutputs(workspace, input.observations),
  ]);
  return { workspacePath, graphPath, graph, workspace, observations, scene: projectGenerationCanvas(graph, workspace, observations) };
}

export async function attachAcceptedBuildToGenerationWorkspace(input: {
  readonly workspacePath: string;
  readonly revision: number;
  readonly accepted: AcceptedGenerationWorkspaceBuild;
}): Promise<GenerationWorkspace> {
  const workspace = await readGenerationWorkspaceFile(input.workspacePath);
  if (workspace.revision !== input.revision) throw new GenerationWorkspaceRevisionConflict(input.revision, workspace.revision);
  const next = applyGenerationWorkspaceTransaction(workspace, planAcceptedGenerationWorkspaceBuild(workspace, input.accepted));
  await writeGenerationWorkspaceFile(input.workspacePath, next);
  return next;
}

export async function attachOutputToGenerationWorkspace(input: {
  readonly workspacePath: string;
  readonly revision: number;
  readonly output: GenerationWorkspaceOutput;
}): Promise<GenerationWorkspace> {
  const workspace = await readGenerationWorkspaceFile(input.workspacePath);
  if (workspace.revision !== input.revision) throw new GenerationWorkspaceRevisionConflict(input.revision, workspace.revision);
  const next = applyGenerationWorkspaceTransaction(workspace, planGenerationWorkspaceOutputAttachment(workspace, input.output));
  await writeGenerationWorkspaceFile(input.workspacePath, next);
  return next;
}

export async function selectGenerationWorkspaceOutput(input: {
  readonly workspacePath: string;
  readonly revision: number;
  readonly node: string;
  readonly output?: GenerationWorkspaceOutputAddress;
}): Promise<GenerationWorkspace> {
  const workspace = await readGenerationWorkspaceFile(input.workspacePath);
  if (workspace.revision !== input.revision) throw new GenerationWorkspaceRevisionConflict(input.revision, workspace.revision);
  const next = applyGenerationWorkspaceTransaction(workspace, {
    revision: workspace.revision,
    commands: [{ kind: "node.select-output", node: input.node, ...(input.output === undefined ? {} : { output: input.output }) }],
  });
  await writeGenerationWorkspaceFile(input.workspacePath, next);
  return next;
}

export type GenerationWorkspaceProductMaterializationContext = {
  readonly product: ProductAddress;
  readonly node: string;
  readonly graphPath: string;
  readonly workspacePath: string;
};

export async function adoptOutputInGenerationWorkspace(input: {
  readonly workspacePath: string;
  readonly workspaceRevision: number;
  readonly graphRevision: number;
  readonly output: GenerationWorkspaceOutputAddress;
  readonly node: string;
  readonly name: string;
  readonly placement: { readonly x: number; readonly y: number };
  readonly graphCommands?: readonly GenerationGraphCommand[];
  readonly materialize: (context: GenerationWorkspaceProductMaterializationContext) => Promise<GenerationGraphNode>;
}): Promise<{
  readonly graph: import("@hypit/generation-graph").GenerationGraphProject;
  readonly workspace: GenerationWorkspace;
  readonly node: GenerationGraphNode;
}> {
  const workspacePath = resolve(input.workspacePath);
  const initialWorkspace = await readGenerationWorkspaceFile(workspacePath);
  if (initialWorkspace.revision !== input.workspaceRevision) {
    throw new GenerationWorkspaceRevisionConflict(input.workspaceRevision, initialWorkspace.revision);
  }
  const graphPath = resolve(dirname(workspacePath), initialWorkspace.graph.path);
  const initialGraph = await readGenerationGraphProjectFile(graphPath);
  if (initialGraph.revision !== input.graphRevision) throw new GenerationGraphRevisionConflict(input.graphRevision, initialGraph.revision);
  const node = await input.materialize({
    product: { publication: input.output.build, name: input.output.output },
    node: input.node,
    graphPath,
    workspacePath,
  });
  if (node.id !== input.node) throw new Error(`Product materializer returned Graph Node ${node.id}, expected ${input.node}.`);
  const workspace = await readGenerationWorkspaceFile(workspacePath);
  if (workspace.revision !== input.workspaceRevision) throw new GenerationWorkspaceRevisionConflict(input.workspaceRevision, workspace.revision);
  const graph = await readGenerationGraphProjectFile(graphPath);
  if (graph.revision !== input.graphRevision) throw new GenerationGraphRevisionConflict(input.graphRevision, graph.revision);
  const plan = planGenerationWorkspaceOutputAdoption({
    graph,
    workspace,
    output: input.output,
    node,
    name: input.name,
    placement: input.placement,
    ...(input.graphCommands === undefined ? {} : { graphCommands: input.graphCommands }),
  });
  const nextGraph = applyGenerationGraphTransaction(graph, plan.graph);
  const nextWorkspace = applyGenerationWorkspaceTransaction(workspace, plan.workspace);
  await writeGenerationGraphProjectFile(graphPath, nextGraph);
  await writeGenerationWorkspaceFile(workspacePath, nextWorkspace);
  return { graph: nextGraph, workspace: nextWorkspace, node: structuredClone(node) };
}
