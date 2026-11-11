import { assertGenerationWorkspace } from "./project.js";
import type {
  GenerationWorkspace,
  GenerationWorkspaceNode,
  GenerationWorkspaceOutput,
  GenerationWorkspaceOutputAddress,
} from "./types.js";
import { generationWorkspaceOutputKey } from "./types.js";

export type GenerationWorkspaceCommand =
  | { readonly kind: "workspace.rename"; readonly name: string }
  | { readonly kind: "node.add"; readonly node: GenerationWorkspaceNode }
  | { readonly kind: "node.rename"; readonly node: string; readonly name: string }
  | { readonly kind: "node.move"; readonly node: string; readonly x: number; readonly y: number }
  | { readonly kind: "node.resize"; readonly node: string; readonly width?: number; readonly height?: number }
  | { readonly kind: "node.remove"; readonly node: string }
  | { readonly kind: "output.attach"; readonly output: GenerationWorkspaceOutput }
  | { readonly kind: "output.detach"; readonly output: GenerationWorkspaceOutputAddress }
  | { readonly kind: "node.select-output"; readonly node: string; readonly output?: GenerationWorkspaceOutputAddress }
  | { readonly kind: "viewport.set"; readonly centerX: number; readonly centerY: number; readonly zoom: number };

export type GenerationWorkspaceTransaction = {
  readonly revision: number;
  readonly commands: readonly GenerationWorkspaceCommand[];
};

export class GenerationWorkspaceRevisionConflict extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`Generation Workspace changed: expected revision ${expected}, found ${actual}.`);
    this.name = "GenerationWorkspaceRevisionConflict";
  }
}

type MutableWorkspace = Omit<GenerationWorkspace, "revision" | "name" | "viewport" | "nodes" | "outputs"> & {
  revision: number;
  name: string;
  viewport: GenerationWorkspace["viewport"];
  nodes: GenerationWorkspaceNode[];
  outputs: GenerationWorkspaceOutput[];
};

function nodeIndex(workspace: MutableWorkspace, node: string): number {
  const index = workspace.nodes.findIndex((candidate) => candidate.node === node);
  if (index < 0) throw new Error(`Unknown Generation Workspace Node: ${node}`);
  return index;
}

function outputIndex(workspace: MutableWorkspace, output: GenerationWorkspaceOutputAddress): number {
  const key = generationWorkspaceOutputKey(output);
  const index = workspace.outputs.findIndex((candidate) => generationWorkspaceOutputKey(candidate) === key);
  if (index < 0) throw new Error(`Unknown Generation Workspace Output: ${output.build}/${output.output}`);
  return index;
}

/** One author gesture becomes one validated Workspace revision without mutating its recipe Graph. */
export function applyGenerationWorkspaceTransaction(
  workspace: GenerationWorkspace,
  transaction: GenerationWorkspaceTransaction,
): GenerationWorkspace {
  assertGenerationWorkspace(workspace);
  if (transaction.revision !== workspace.revision) {
    throw new GenerationWorkspaceRevisionConflict(transaction.revision, workspace.revision);
  }
  const next = structuredClone(workspace) as MutableWorkspace;
  for (const command of transaction.commands) {
    switch (command.kind) {
      case "workspace.rename":
        next.name = command.name;
        break;
      case "node.add":
        if (next.nodes.some((candidate) => candidate.node === command.node.node)) {
          throw new Error(`Generation Workspace Node ${command.node.node} already exists.`);
        }
        next.nodes.push(structuredClone(command.node));
        break;
      case "node.rename": {
        const index = nodeIndex(next, command.node);
        next.nodes.splice(index, 1, { ...next.nodes[index]!, name: command.name });
        break;
      }
      case "node.move": {
        const index = nodeIndex(next, command.node);
        next.nodes.splice(index, 1, { ...next.nodes[index]!, x: command.x, y: command.y });
        break;
      }
      case "node.resize": {
        const index = nodeIndex(next, command.node);
        if (command.width === undefined && command.height === undefined) {
          const { width: _width, height: _height, ...rest } = next.nodes[index]!;
          next.nodes.splice(index, 1, rest);
          break;
        }
        if (command.width === undefined || command.height === undefined) {
          throw new Error(`Generation Workspace Node ${command.node} size must provide both width and height.`);
        }
        next.nodes.splice(index, 1, { ...next.nodes[index]!, width: command.width, height: command.height });
        break;
      }
      case "node.remove":
        next.nodes.splice(nodeIndex(next, command.node), 1);
        next.outputs = next.outputs.filter((output) => output.node !== command.node);
        break;
      case "output.attach":
        nodeIndex(next, command.output.node);
        if (next.outputs.some((candidate) => generationWorkspaceOutputKey(candidate)
          === generationWorkspaceOutputKey(command.output))) {
          throw new Error(`Generation Workspace Output ${command.output.build}/${command.output.output} already exists.`);
        }
        next.outputs.push(structuredClone(command.output));
        break;
      case "output.detach": {
        const index = outputIndex(next, command.output);
        next.outputs.splice(index, 1);
        next.nodes = next.nodes.map((node) => node.selected !== undefined
          && generationWorkspaceOutputKey(node.selected) === generationWorkspaceOutputKey(command.output)
          ? (({ selected: _selected, ...rest }) => rest)(node)
          : node);
        break;
      }
      case "node.select-output": {
        const index = nodeIndex(next, command.node);
        if (command.output === undefined) {
          const { selected: _selected, ...rest } = next.nodes[index]!;
          next.nodes.splice(index, 1, rest);
          break;
        }
        const output = next.outputs[outputIndex(next, command.output)]!;
        if (output.node !== command.node) {
          throw new Error(`Generation Workspace Output ${output.build}/${output.output} belongs to ${output.node}, not ${command.node}.`);
        }
        next.nodes.splice(index, 1, { ...next.nodes[index]!, selected: structuredClone(command.output) });
        break;
      }
      case "viewport.set":
        next.viewport = { centerX: command.centerX, centerY: command.centerY, zoom: command.zoom };
        break;
    }
  }
  next.revision += 1;
  assertGenerationWorkspace(next);
  return structuredClone(next);
}
