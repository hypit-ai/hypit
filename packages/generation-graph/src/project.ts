import { canonicalize } from "@hypit/protocol";
import { isModuleRef } from "@hypit/module";

import type {
  GenerationGraphInput,
  GenerationGraphNode,
  GenerationGraphProject,
} from "./types.js";
import { generationGraphFormat } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function identity(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function assertInput(value: GenerationGraphInput, label: string): void {
  object(value, label);
  const keys = Object.keys(value);
  if ("node" in value) {
    assert(keys.length === 1, `${label} Node reference must contain only node.`);
    identity(value.node, `${label} Node reference`);
    return;
  }
  assert("value" in value && keys.length === 1, `${label} must contain exactly value or node.`);
  canonicalize(value.value);
}

function assertNode(value: GenerationGraphNode): void {
  object(value, "Generation Graph Node");
  identity(value.id, "Generation Graph Node id");
  object(value.using, `Generation Graph Node ${value.id} using`);
  assert(isModuleRef(value.using.module), `Generation Graph Node ${value.id} Module is invalid.`);
  identity(value.using.name, `Generation Graph Node ${value.id} component name`);
  object(value.inputs, `Generation Graph Node ${value.id} inputs`);
  for (const [name, input] of Object.entries(value.inputs)) {
    identity(name, `Generation Graph Node ${value.id} input name`);
    assertInput(input, `Generation Graph Node ${value.id} input ${name}`);
  }
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify(["id", "inputs", "using"]),
    `Generation Graph Node ${value.id} must contain only id, using and inputs.`);
}

export function assertGenerationGraphProject(value: GenerationGraphProject): void {
  object(value, "Generation Graph Project");
  assert(value.format === generationGraphFormat, "Unsupported Generation Graph Project format.");
  identity(value.id, "Generation Graph Project id");
  assert(typeof value.name === "string" && value.name.trim().length > 0,
    "Generation Graph Project name is empty.");
  assert(Number.isSafeInteger(value.revision) && value.revision >= 0,
    "Generation Graph Project revision must be a non-negative safe integer.");
  assert(JSON.stringify(Object.keys(value).sort())
    === JSON.stringify(["format", "id", "name", "nodes", "revision"]),
  "Generation Graph Project must contain only format, id, name, revision and nodes.");
  assert(Array.isArray(value.nodes), "Generation Graph Project Nodes are invalid.");
  const nodes = new Map<string, GenerationGraphNode>();
  for (const node of value.nodes as readonly GenerationGraphNode[]) {
    assertNode(node);
    assert(!nodes.has(node.id), `Generation Graph Project repeats Node ${node.id}.`);
    nodes.set(node.id, node);
  }
  for (const node of value.nodes as readonly GenerationGraphNode[]) {
    for (const input of Object.values(node.inputs) as GenerationGraphInput[]) {
      if (!("node" in input)) continue;
      assert(input.node !== node.id, `Generation Graph Node ${node.id} references itself.`);
      assert(nodes.has(input.node), `Generation Graph Node ${node.id} references missing Node ${input.node}.`);
    }
  }
  const visiting: string[] = [];
  const visitingAt = new Map<string, number>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    const cycleAt = visitingAt.get(id);
    assert(cycleAt === undefined,
      `Generation Graph contains a cycle: ${[...visiting.slice(cycleAt), id].join(" -> ")}.`);
    visitingAt.set(id, visiting.length);
    visiting.push(id);
    const node = nodes.get(id)!;
    for (const input of Object.values(node.inputs)) if ("node" in input) visit(input.node);
    visiting.pop();
    visitingAt.delete(id);
    visited.add(id);
  };
  (value.nodes as readonly GenerationGraphNode[]).forEach((node) => visit(node.id));

}

export function sealGenerationGraphProject(value: GenerationGraphProject): GenerationGraphProject {
  assertGenerationGraphProject(value);
  return structuredClone(value);
}

export function createGenerationGraphProject(input: {
  readonly id: string;
  readonly name: string;
}): GenerationGraphProject {
  return sealGenerationGraphProject({
    format: generationGraphFormat,
    id: input.id,
    name: input.name,
    revision: 0,
    nodes: [],
  });
}

export function parseGenerationGraphProject(text: string): GenerationGraphProject {
  return sealGenerationGraphProject(JSON.parse(text) as GenerationGraphProject);
}

export function serializeGenerationGraphProject(value: GenerationGraphProject): string {
  assertGenerationGraphProject(value);
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

export function findGenerationGraphNode(
  project: GenerationGraphProject,
  id: string,
): GenerationGraphNode {
  assertGenerationGraphProject(project);
  const node = project.nodes.find((candidate) => candidate.id === id);
  if (node === undefined) throw new Error(`Unknown Generation Graph Node: ${id}`);
  return structuredClone(node);
}
