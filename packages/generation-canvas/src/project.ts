import type {
  GenerationWorkspace,
  GenerationWorkspaceGraphReference,
  GenerationWorkspaceNode,
  GenerationWorkspaceOutput,
  GenerationWorkspaceOutputAddress,
  GenerationWorkspaceViewport,
} from "./types.js";
import { generationWorkspaceOutputKey } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[], label: string): void {
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()),
    `${label} must contain only ${keys.join(", ")}.`);
}

function identity(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function portablePath(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty string.`);
  assert(!value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value),
    `${label} must be a portable relative path.`);
  const relative = value.startsWith("./") ? value.slice(2) : value;
  assert(relative.length > 0 && relative.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."),
    `${label} must not contain empty, current or parent segments.`);
}

function assertGraph(value: GenerationWorkspaceGraphReference): void {
  object(value, "Generation Workspace Graph reference");
  exactKeys(value, ["path"], "Generation Workspace Graph reference");
  portablePath(value.path, "Generation Workspace Graph path");
}

function assertAddress(value: GenerationWorkspaceOutputAddress, label: string): void {
  object(value, label);
  exactKeys(value, ["build", "output"], label);
  assert(typeof value.build === "string" && value.build.trim().length > 0, `${label} Build identity is empty.`);
  identity(value.output, `${label} output`);
}

function assertNode(value: GenerationWorkspaceNode): void {
  object(value, "Generation Workspace Node");
  const hasSize = value.width !== undefined || value.height !== undefined;
  assert((value.width === undefined) === (value.height === undefined),
    "Generation Workspace Node size must provide both width and height.");
  exactKeys(value, ["node", "name", "x", "y",
    ...(hasSize ? ["width", "height"] : []), ...(value.selected === undefined ? [] : ["selected"])],
  "Generation Workspace Node");
  identity(value.node, "Generation Workspace Node identity");
  assert(typeof value.name === "string" && value.name.trim().length > 0,
    `Generation Workspace Node ${value.node} name is empty.`);
  assert(Number.isFinite(value.x) && Number.isFinite(value.y),
    `Generation Workspace Node ${value.node} position must be finite.`);
  if (hasSize) {
    assert(Number.isFinite(value.width) && value.width! >= 160 && value.width! <= 960,
      `Generation Workspace Node ${value.node} width must be from 160 through 960.`);
    assert(Number.isFinite(value.height) && value.height! >= 72 && value.height! <= 960,
      `Generation Workspace Node ${value.node} height must be from 72 through 960.`);
  }
  if (value.selected !== undefined) assertAddress(value.selected, `Generation Workspace Node ${value.node} selection`);
}

function assertViewport(value: GenerationWorkspaceViewport): void {
  object(value, "Generation Workspace Viewport");
  exactKeys(value, ["centerX", "centerY", "zoom"], "Generation Workspace Viewport");
  assert(Number.isFinite(value.centerX) && Number.isFinite(value.centerY),
    "Generation Workspace Viewport center must be finite.");
  assert(Number.isFinite(value.zoom) && value.zoom >= 0.25 && value.zoom <= 2,
    "Generation Workspace Viewport zoom must be from 0.25 through 2.");
}

function assertOutput(value: GenerationWorkspaceOutput): void {
  object(value, "Generation Workspace Output");
  exactKeys(value, ["node", "build", "output"], "Generation Workspace Output");
  identity(value.node, "Generation Workspace Output node");
  assertAddress({ build: value.build, output: value.output }, `Generation Workspace Output ${value.node}`);
}

export function assertGenerationWorkspace(value: GenerationWorkspace): void {
  object(value, "Generation Workspace");
  exactKeys(value, ["format", "id", "name", "revision", "graph", "packages", "viewport", "nodes", "outputs"], "Generation Workspace");
  assert(value.format === "hypit.generation-workspace@1", "Unsupported Generation Workspace format.");
  identity(value.id, "Generation Workspace id");
  assert(typeof value.name === "string" && value.name.trim().length > 0, "Generation Workspace name is empty.");
  assert(Number.isSafeInteger(value.revision) && value.revision >= 0,
    "Generation Workspace revision must be a non-negative safe integer.");
  assertGraph(value.graph);
  assert(Array.isArray(value.packages), "Generation Workspace Packages are invalid.");
  const packages = new Set<string>();
  for (const specifier of value.packages) {
    assert(typeof specifier === "string" && /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/u.test(specifier),
      `Generation Workspace package ${String(specifier)} is invalid.`);
    assert(!packages.has(specifier), `Generation Workspace repeats package ${specifier}.`);
    packages.add(specifier);
  }
  assertViewport(value.viewport);
  assert(Array.isArray(value.nodes), "Generation Workspace Nodes are invalid.");
  assert(Array.isArray(value.outputs), "Generation Workspace Outputs are invalid.");
  const nodes = new Set<string>();
  for (const node of value.nodes) {
    assertNode(node);
    assert(!nodes.has(node.node), `Generation Workspace repeats Node ${node.node}.`);
    nodes.add(node.node);
  }
  const outputs = new Map<string, GenerationWorkspaceOutput>();
  for (const output of value.outputs) {
    assertOutput(output);
    assert(nodes.has(output.node), `Generation Workspace Output ${output.build}/${output.output} has no Node ${output.node}.`);
    const key = generationWorkspaceOutputKey(output);
    assert(!outputs.has(key), `Generation Workspace repeats Output ${output.build}/${output.output}.`);
    outputs.set(key, output);
  }
  for (const node of value.nodes) {
    if (node.selected === undefined) continue;
    const selected = outputs.get(generationWorkspaceOutputKey(node.selected));
    assert(selected !== undefined && selected.node === node.node,
      `Generation Workspace Node ${node.node} selects an unattached Output.`);
  }
}

export function sealGenerationWorkspace(value: GenerationWorkspace): GenerationWorkspace {
  assertGenerationWorkspace(value);
  return structuredClone(value);
}

export function createGenerationWorkspace(input: {
  readonly id: string;
  readonly name: string;
  readonly graph: GenerationWorkspaceGraphReference;
  readonly packages?: readonly string[];
}): GenerationWorkspace {
  return sealGenerationWorkspace({
    format: "hypit.generation-workspace@1",
    id: input.id,
    name: input.name,
    revision: 0,
    graph: structuredClone(input.graph),
    packages: [...(input.packages ?? [])],
    viewport: { centerX: 0, centerY: 0, zoom: 0.82 },
    nodes: [],
    outputs: [],
  });
}

export function parseGenerationWorkspace(text: string): GenerationWorkspace {
  return sealGenerationWorkspace(JSON.parse(text) as GenerationWorkspace);
}

export function serializeGenerationWorkspace(value: GenerationWorkspace): string {
  assertGenerationWorkspace(value);
  return `${JSON.stringify(value, undefined, 2)}\n`;
}
