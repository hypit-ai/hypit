import {
  assertBuildId,
  canonicalize,
  isModuleRef,
} from "@hypit/protocol";

import type {
  GenerationGraphInput,
  GenerationGraphNode,
  GenerationGraphProject,
  GenerationNodeProduct,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function identity(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

export function assertGenerationGraphPath(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty path.`);
  assert(!value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value),
    `${label} must use a portable relative path.`);
  const relative = value.startsWith("./") ? value.slice(2) : value;
  assert(relative.length > 0 && relative.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."),
    `${label} must not contain empty, current or parent segments.`);
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
  assert(Array.isArray(value.products), `Generation Graph Node ${value.id} products must be an array.`);
  const products = new Set<string>();
  for (const path of value.products) {
    assertGenerationGraphPath(path, `Generation Graph Node ${value.id} Product path`);
    assert(path !== "generate", `Generation Graph Node ${value.id} Product path cannot be generate.`);
    assert(!products.has(path), `Generation Graph Node ${value.id} repeats Product ${path}.`);
    products.add(path);
  }
  assert(value.selected === "generate" || products.has(value.selected),
    `Generation Graph Node ${value.id} selects an unlisted Product.`);
}

export function assertGenerationGraphProject(value: GenerationGraphProject): void {
  object(value, "Generation Graph Project");
  assert(value.format === "hypit.generation-graph@1", "Unsupported Generation Graph Project format.");
  identity(value.id, "Generation Graph Project id");
  assert(typeof value.name === "string" && value.name.trim().length > 0,
    "Generation Graph Project name is empty.");
  assert(Number.isSafeInteger(value.revision) && value.revision >= 0,
    "Generation Graph Project revision must be a non-negative safe integer.");
  assert(Array.isArray(value.nodes) && Array.isArray(value.layout),
    "Generation Graph Project collections are invalid.");
  const nodes = new Map<string, GenerationGraphNode>();
  const productPaths = new Set<string>();
  for (const node of value.nodes as readonly GenerationGraphNode[]) {
    assertNode(node);
    assert(!nodes.has(node.id), `Generation Graph Project repeats Node ${node.id}.`);
    nodes.set(node.id, node);
    for (const path of node.products) {
      assert(!productPaths.has(path), `Generation Graph Project assigns Product ${path} to multiple Nodes.`);
      productPaths.add(path);
    }
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

  const positioned = new Set<string>();
  for (const entry of value.layout) {
    object(entry, "Generation Graph layout entry");
    identity(entry.node, "Generation Graph layout Node");
    assert(nodes.has(entry.node), `Generation Graph layout references missing Node ${entry.node}.`);
    assert(!positioned.has(entry.node), `Generation Graph layout repeats Node ${entry.node}.`);
    assert(Number.isFinite(entry.x) && Number.isFinite(entry.y),
      `Generation Graph Node ${entry.node} position must be finite.`);
    positioned.add(entry.node);
  }
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
    format: "hypit.generation-graph@1",
    id: input.id,
    name: input.name,
    revision: 0,
    nodes: [],
    layout: [],
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

export function assertGenerationNodeProduct(value: GenerationNodeProduct): void {
  object(value, "Generation Node Product");
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify(["build", "format", "output"]),
    "Generation Node Product must contain only format, build and output.");
  assert(value.format === "hypit.node-product@1", "Unsupported Generation Node Product format.");
  assert(typeof value.build === "string", "Generation Node Product build is invalid.");
  assertBuildId(value.build);
  assert(typeof value.output === "string" && value.output.length > 0 && value.output === value.output.trim(),
    "Generation Node Product output is invalid.");
}

export function parseGenerationNodeProduct(text: string): GenerationNodeProduct {
  const value = JSON.parse(text) as GenerationNodeProduct;
  assertGenerationNodeProduct(value);
  return structuredClone(value);
}

export function serializeGenerationNodeProduct(value: GenerationNodeProduct): string {
  assertGenerationNodeProduct(value);
  return `${JSON.stringify(value, undefined, 2)}\n`;
}
