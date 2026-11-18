import type { InvocationAddress, JsonValue } from "@hypit/execution";
import { assertProjectRelativePath } from "@hypit/project";

export type MediaReference = { readonly path: string };
export type CanvasSource = { readonly node: string; readonly output: string };
export type CanvasValue =
  | { readonly value: JsonValue }
  | { readonly from: CanvasSource; readonly personReference?: boolean }
  | { readonly media: MediaReference; readonly personReference?: boolean };
export type CanvasBinding = CanvasValue | { readonly items: readonly CanvasValue[] };
export type CanvasRecipe = { readonly capability: string; readonly inputs: Readonly<Record<string, CanvasBinding>> };
export type CanvasNode = { readonly id: string; readonly name?: string } & (CanvasRecipe | { readonly media: MediaReference });
export type CanvasPlacement = { readonly x: number; readonly y: number; readonly width?: number; readonly height?: number };
export type CanvasSelection = { readonly address: InvocationAddress; readonly output: string; readonly resource?: string };
export type CanvasResults = {
  readonly invocations: readonly InvocationAddress[];
  readonly selected: Readonly<Record<string, CanvasSelection>>;
};
export type CanvasDocument = {
  readonly format: "hypit.canvas";
  readonly id: string;
  readonly name: string;
  readonly nodes: readonly CanvasNode[];
  readonly layout: Readonly<Record<string, CanvasPlacement>>;
  readonly results: Readonly<Record<string, CanvasResults>>;
};

export class CanvasError extends Error {
  constructor(readonly code: string, message: string, readonly subject?: { readonly node?: string; readonly input?: string }) {
    super(message);
  }
}

export function record(value: unknown, subject: string, fields?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || (fields !== undefined && Object.keys(value).some(field => !fields.includes(field)))) {
    throw new CanvasError("invalid-value", subject + " has invalid fields.");
  }
  return value as Record<string, unknown>;
}

export function text(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new CanvasError("invalid-value", subject + " must be nonempty text.");
  return value;
}

export function identity(value: unknown, subject: string): string {
  const result = text(value, subject);
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,191}$/u.test(result)) throw new CanvasError("invalid-value", subject + " is invalid.");
  return result;
}

function json(value: unknown): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value))) return value;
  if (Array.isArray(value)) return value.map(json);
  return Object.fromEntries(Object.entries(record(value, "Canvas literal")).map(([name, item]) => [name, json(item)]));
}

function map<Value>(value: unknown, subject: string, read: (value: unknown) => Value): Record<string, Value> {
  return Object.fromEntries(Object.entries(record(value, subject)).map(([name, item]) => [identity(name, subject + " key"), read(item)]));
}

export function readMediaReference(value: unknown): MediaReference {
  const source = record(value, "Media reference", ["path"]);
  const path = text(source.path, "Media path");
  assertProjectRelativePath(path);
  return { path };
}

function readValue(value: unknown): CanvasValue {
  const binding = record(value, "Canvas binding");
  if (Object.hasOwn(binding, "value")) return { value: json(record(binding, "Literal binding", ["value"]).value) };
  if (binding.personReference !== undefined && typeof binding.personReference !== "boolean") {
    throw new CanvasError("invalid-value", "Person reference must be boolean.");
  }
  const policy = binding.personReference === undefined ? {} : { personReference: binding.personReference };
  if (Object.hasOwn(binding, "media")) return { media: readMediaReference(record(binding, "Media binding", ["media", "personReference"]).media), ...policy };
  const from = record(record(binding, "Link binding", ["from", "personReference"]).from, "Link source", ["node", "output"]);
  return { from: { node: identity(from.node, "Source node"), output: identity(from.output, "Source output") }, ...policy };
}

export function readBinding(value: unknown): CanvasBinding {
  const binding = record(value, "Canvas input");
  if (!Object.hasOwn(binding, "items")) return readValue(binding);
  const items = record(binding, "Canvas input list", ["items"]).items;
  if (!Array.isArray(items)) throw new CanvasError("invalid-value", "Canvas input list must be an array.");
  return { items: items.map(readValue) };
}

export function readRecipe(value: unknown): CanvasRecipe {
  const recipe = record(value, "Canvas recipe", ["capability", "inputs"]);
  const capability = text(recipe.capability, "Capability");
  if (!/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(capability)) {
    throw new CanvasError("invalid-value", "Canvas Capability must include its npm package and model.");
  }
  return { capability, inputs: map(recipe.inputs, "Canvas inputs", readBinding) };
}

export function readNode(value: unknown): CanvasNode {
  const node = record(value, "Canvas node", ["id", "name", "media", "capability", "inputs"]);
  const id = identity(node.id, "Node id");
  const name = node.name === undefined ? {} : { name: text(node.name, "Node name") };
  if (Object.hasOwn(node, "media")) {
    record(node, "Media node", ["id", "name", "media"]);
    return { id, ...name, media: readMediaReference(node.media) };
  }
  return { id, ...name, ...readRecipe({ capability: node.capability, inputs: node.inputs }) };
}

export function number(value: unknown, subject: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new CanvasError("invalid-value", subject + " must be finite.");
  return value;
}

export function readPlacement(value: unknown): CanvasPlacement {
  const layout = record(value, "Canvas layout", ["x", "y", "width", "height"]);
  const position = { x: number(layout.x, "Layout x"), y: number(layout.y, "Layout y") };
  if (layout.width === undefined && layout.height === undefined) return position;
  const width = number(layout.width, "Layout width"), height = number(layout.height, "Layout height");
  if (width <= 0 || height <= 0) throw new CanvasError("invalid-value", "Canvas dimensions must be positive.");
  return { ...position, width, height };
}

export function readAddress(value: unknown): InvocationAddress {
  const address = record(value, "Invocation address", ["environment", "invocation"]);
  const environment = identity(address.environment, "Environment id");
  const invocation = text(address.invocation, "Invocation id");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(invocation)
    || environment !== environment.toLowerCase()) throw new CanvasError("invalid-value", "Invocation address is invalid.");
  return { environment, invocation };
}

export function sameAddress(a: InvocationAddress, b: InvocationAddress): boolean {
  return a.environment === b.environment && a.invocation === b.invocation;
}

export function readSelection(value: unknown): CanvasSelection {
  const selection = record(value, "Canvas selection", ["address", "output", "resource"]);
  return { address: readAddress(selection.address), output: identity(selection.output, "Publication output"),
    ...(selection.resource === undefined ? {} : { resource: identity(selection.resource, "Publication resource") }) };
}

function readResults(value: unknown): CanvasResults {
  const result = record(value, "Canvas results", ["invocations", "selected"]);
  if (!Array.isArray(result.invocations)) throw new CanvasError("invalid-value", "Attached Invocations must be an array.");
  const invocations = result.invocations.map(readAddress);
  const identities = new Set(invocations.map(({ environment, invocation }) => environment + "/" + invocation));
  if (identities.size !== invocations.length) throw new CanvasError("duplicate-attachment", "Canvas repeats an Invocation attachment.");
  const selected = map(result.selected, "Canvas selected outputs", readSelection);
  for (const item of Object.values(selected)) {
    if (!invocations.some(address => sameAddress(address, item.address))) {
      throw new CanvasError("missing-attachment", "Selected Publication must belong to an attached Invocation.");
    }
  }
  return { invocations, selected };
}

export function bindingValues(binding: CanvasBinding): readonly CanvasValue[] {
  return "items" in binding ? binding.items : [binding];
}

export function readCanvas(value: unknown): CanvasDocument {
  const document = record(value, "Canvas document", ["format", "id", "name", "nodes", "layout", "results"]);
  if (document.format !== "hypit.canvas" || !Array.isArray(document.nodes)) throw new CanvasError("invalid-document", "Canvas document is invalid.");
  const nodes = document.nodes.map(readNode);
  const ids = new Set(nodes.map(node => node.id));
  if (ids.size !== nodes.length) throw new CanvasError("duplicate-node", "Canvas repeats a node ID.");
  const layout = map(document.layout, "Canvas layout", readPlacement);
  const results = map(document.results, "Canvas results", readResults);
  if (Object.keys(layout).length !== nodes.length || nodes.some(node => !Object.hasOwn(layout, node.id))) {
    throw new CanvasError("invalid-layout", "Each Canvas node needs one placement.");
  }
  for (const id of Object.keys(results)) {
    if (!nodes.some(node => node.id === id && "capability" in node)) throw new CanvasError("invalid-results", "Results must reference a recipe node.");
  }
  for (const node of nodes) {
    if (!("capability" in node)) continue;
    for (const [input, binding] of Object.entries(node.inputs)) {
      for (const source of bindingValues(binding)) {
        if ("from" in source && !ids.has(source.from.node)) {
          throw new CanvasError("missing-node", "Link source " + source.from.node + " does not exist.", { node: node.id, input });
        }
      }
    }
  }
  return { format: "hypit.canvas", id: identity(document.id, "Canvas id"), name: text(document.name, "Canvas name"), nodes, layout, results };
}

export function decodeCanvas(contents: string): CanvasDocument {
  let value: unknown;
  try { value = JSON.parse(contents); }
  catch { throw new CanvasError("invalid-document", "Canvas document must be JSON."); }
  return readCanvas(value);
}

export function encodeCanvas(document: CanvasDocument): string {
  return JSON.stringify(readCanvas(document), null, 2) + "\n";
}
