import type {
  GenerationCanvasGraphReference,
  GenerationCanvasItem,
  GenerationCanvasSubject,
  GenerationCanvasView,
} from "./types.js";
import { generationCanvasSubjectKey } from "./types.js";

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

function assertGraph(value: GenerationCanvasGraphReference): void {
  object(value, "Generation Canvas Graph reference");
  exactKeys(value, ["path"], "Generation Canvas Graph reference");
  portablePath(value.path, "Generation Canvas Graph path");
}

function assertSubject(value: GenerationCanvasSubject, label: string): void {
  object(value, label);
  if (value.kind === "graph-node") {
    exactKeys(value, ["kind", "node"], label);
    identity(value.node, `${label} Node`);
    return;
  }
  assert(value.kind === "build-output", `${label} kind is invalid.`);
  exactKeys(value, ["kind", "build", "output"], label);
  assert(typeof value.build === "string" && value.build.trim().length > 0,
    `${label} Build identity is empty.`);
  identity(value.output, `${label} output`);
}

function assertItem(value: GenerationCanvasItem): void {
  object(value, "Generation Canvas Item");
  exactKeys(value, ["id", "subject", "x", "y"], "Generation Canvas Item");
  identity(value.id, "Generation Canvas Item id");
  assertSubject(value.subject, `Generation Canvas Item ${value.id} subject`);
  assert(Number.isFinite(value.x) && Number.isFinite(value.y),
    `Generation Canvas Item ${value.id} position must be finite.`);
}

export function assertGenerationCanvasView(value: GenerationCanvasView): void {
  object(value, "Generation Canvas View");
  exactKeys(value, ["format", "id", "name", "revision", "graph", "items"], "Generation Canvas View");
  assert(value.format === "hypit.generation-canvas@1", "Unsupported Generation Canvas format.");
  identity(value.id, "Generation Canvas View id");
  assert(typeof value.name === "string" && value.name.trim().length > 0,
    "Generation Canvas View name is empty.");
  assert(Number.isSafeInteger(value.revision) && value.revision >= 0,
    "Generation Canvas View revision must be a non-negative safe integer.");
  assertGraph(value.graph);
  assert(Array.isArray(value.items), "Generation Canvas View Items are invalid.");
  const ids = new Set<string>();
  const subjects = new Set<string>();
  for (const item of value.items) {
    assertItem(item);
    assert(!ids.has(item.id), `Generation Canvas View repeats Item ${item.id}.`);
    ids.add(item.id);
    const subject = generationCanvasSubjectKey(item.subject);
    assert(!subjects.has(subject), `Generation Canvas View repeats subject ${subject}.`);
    subjects.add(subject);
  }
}

export function sealGenerationCanvasView(value: GenerationCanvasView): GenerationCanvasView {
  assertGenerationCanvasView(value);
  return structuredClone(value);
}

export function createGenerationCanvasView(input: {
  readonly id: string;
  readonly name: string;
  readonly graph: GenerationCanvasGraphReference;
}): GenerationCanvasView {
  return sealGenerationCanvasView({
    format: "hypit.generation-canvas@1",
    id: input.id,
    name: input.name,
    revision: 0,
    graph: structuredClone(input.graph),
    items: [],
  });
}

export function parseGenerationCanvasView(text: string): GenerationCanvasView {
  return sealGenerationCanvasView(JSON.parse(text) as GenerationCanvasView);
}

export function serializeGenerationCanvasView(value: GenerationCanvasView): string {
  assertGenerationCanvasView(value);
  return `${JSON.stringify(value, undefined, 2)}\n`;
}
