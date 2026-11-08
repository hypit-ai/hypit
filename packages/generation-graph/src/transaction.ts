import { assertGenerationGraphProject } from "./project.js";
import type {
  GenerationGraphNode,
  GenerationGraphNodeLayout,
  GenerationGraphProject,
} from "./types.js";

export type GenerationGraphCommand =
  | { readonly kind: "project.rename"; readonly name: string }
  | { readonly kind: "node.add"; readonly node: GenerationGraphNode }
  | { readonly kind: "node.replace"; readonly node: GenerationGraphNode }
  | { readonly kind: "node.remove"; readonly id: string }
  | { readonly kind: "node.product.add"; readonly id: string; readonly path: string }
  | { readonly kind: "node.product.remove"; readonly id: string; readonly path: string }
  | { readonly kind: "node.select"; readonly id: string; readonly selected: "generate" | string }
  | { readonly kind: "node.position"; readonly position: GenerationGraphNodeLayout }
  | { readonly kind: "node.position.remove"; readonly id: string };

export type GenerationGraphTransaction = {
  readonly revision: number;
  readonly commands: readonly GenerationGraphCommand[];
};

export class GenerationGraphRevisionConflict extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`Generation Graph Project changed: expected revision ${expected}, found ${actual}.`);
    this.name = "GenerationGraphRevisionConflict";
  }
}

type MutableProject = Omit<GenerationGraphProject, "revision" | "name" | "nodes" | "layout"> & {
  revision: number;
  name: string;
  nodes: GenerationGraphNode[];
  layout: GenerationGraphNodeLayout[];
};

function node(project: MutableProject, id: string): GenerationGraphNode {
  const found = project.nodes.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`Unknown Generation Graph Node: ${id}`);
  return found;
}

/** One UI or Agent edit becomes one validated graph revision. */
export function applyGenerationGraphTransaction(
  project: GenerationGraphProject,
  transaction: GenerationGraphTransaction,
): GenerationGraphProject {
  assertGenerationGraphProject(project);
  if (transaction.revision !== project.revision) {
    throw new GenerationGraphRevisionConflict(transaction.revision, project.revision);
  }
  const next = structuredClone(project) as MutableProject;
  for (const command of transaction.commands) {
    switch (command.kind) {
      case "project.rename":
        next.name = command.name;
        break;
      case "node.add":
        next.nodes.push(structuredClone(command.node));
        break;
      case "node.replace": {
        const index = next.nodes.findIndex((candidate) => candidate.id === command.node.id);
        if (index < 0) throw new Error(`Unknown Generation Graph Node: ${command.node.id}`);
        next.nodes.splice(index, 1, structuredClone(command.node));
        break;
      }
      case "node.remove":
        node(next, command.id);
        if (next.nodes.some((candidate) => Object.values(candidate.inputs)
          .some((input) => "node" in input && input.node === command.id))) {
          throw new Error(`Generation Graph Node ${command.id} is still referenced.`);
        }
        next.nodes = next.nodes.filter((candidate) => candidate.id !== command.id);
        next.layout = next.layout.filter((entry) => entry.node !== command.id);
        break;
      case "node.product.add": {
        const current = node(next, command.id);
        (current as { products: readonly string[] }).products = [...current.products, command.path];
        break;
      }
      case "node.product.remove": {
        const current = node(next, command.id);
        if (!current.products.includes(command.path)) {
          throw new Error(`Generation Graph Node ${command.id} has no Product ${command.path}.`);
        }
        if (current.selected === command.path) {
          throw new Error(`Select generate or another Product before removing ${command.path}.`);
        }
        (current as { products: readonly string[] }).products = current.products.filter((path) => path !== command.path);
        break;
      }
      case "node.select":
        (node(next, command.id) as { selected: "generate" | string }).selected = command.selected;
        break;
      case "node.position": {
        node(next, command.position.node);
        const index = next.layout.findIndex((entry) => entry.node === command.position.node);
        if (index < 0) next.layout.push(structuredClone(command.position));
        else next.layout.splice(index, 1, structuredClone(command.position));
        break;
      }
      case "node.position.remove":
        node(next, command.id);
        next.layout = next.layout.filter((entry) => entry.node !== command.id);
        break;
    }
  }
  next.revision += 1;
  assertGenerationGraphProject(next);
  return structuredClone(next);
}
