import type { HtmlVisual, HtmlVisualDependency } from "./types.js";

export function htmlVisualDependencyUrl(id: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,191}$/u.test(id)) throw new Error("HTML visual dependency id is invalid.");
  return `hypit-dependency://${encodeURIComponent(id)}`;
}

function record(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
}

function closed(value: unknown, label: string, ancestors: Set<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
    return;
  }
  if (typeof value !== "object") throw new Error(`${label} is not JSON-compatible.`);
  if (ancestors.has(value)) throw new Error(`${label} contains a cycle.`);
  ancestors.add(value);
  if (Array.isArray(value)) value.forEach((member, index) => closed(member, `${label}.${index}`, ancestors));
  else {
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label} must be a plain object.`);
    for (const [name, member] of Object.entries(value)) {
      if (member === undefined) throw new Error(`${label}.${name} is undefined.`);
      closed(member, `${label}.${name}`, ancestors);
    }
  }
  ancestors.delete(value);
}

function dependency(value: HtmlVisualDependency, index: number): void {
  record(value, `HTML visual dependency ${index}`);
  if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,191}$/u.test(value.id)) throw new Error(`HTML visual dependency ${index} id is invalid.`);
  if (!["data", "font", "picture"].includes(value.kind)) throw new Error(`HTML visual dependency ${value.id} kind is invalid.`);
  record(value.resource, `HTML visual dependency ${value.id} resource`);
  if (typeof value.resource.address !== "string" || value.resource.address.length === 0
    || typeof value.resource.mediaType !== "string" || value.resource.mediaType.length === 0) {
    throw new Error(`HTML visual dependency ${value.id} resource is invalid.`);
  }
  if (value.kind === "font") {
    if (typeof value.family !== "string" || !/^[A-Za-z0-9 _-]+$/u.test(value.family)
      || value.weight !== undefined && !/^(?:normal|bold|[0-9]{1,4}(?: [0-9]{1,4})?)$/u.test(value.weight)
      || value.style !== undefined && !["normal", "italic", "oblique"].includes(value.style)
      || value.unicodeRange !== undefined && !/^U\+[\da-f?]{1,6}(?:-[\da-f]{1,6})?(?:,U\+[\da-f?]{1,6}(?:-[\da-f]{1,6})?)*$/iu.test(value.unicodeRange)) {
      throw new Error(`HTML visual font ${value.id} has an invalid face descriptor.`);
    }
  }
}

export function assertHtmlVisual(value: HtmlVisual): void {
  record(value, "HTML visual");
  if (typeof value.html !== "string") throw new Error("HTML visual html must be a string.");
  if (value.css !== undefined && typeof value.css !== "string") throw new Error("HTML visual css must be a string.");
  if (value.setup !== undefined && typeof value.setup !== "string") throw new Error("HTML visual setup must be a string.");
  if (value.data !== undefined) closed(value.data, "HTML visual data", new Set());
  const identities = new Set<string>();
  for (const [index, item] of (value.dependencies ?? []).entries()) {
    dependency(item, index);
    if (identities.has(item.id)) throw new Error(`HTML visual repeats dependency ${item.id}.`);
    identities.add(item.id);
  }
}

export function defineHtmlVisual(value: HtmlVisual): HtmlVisual {
  assertHtmlVisual(value);
  return structuredClone(value);
}

export function placeHtmlVisualInputs(value: HtmlVisual, inputs: Readonly<Record<string, string>>): string {
  const used = new Set<string>();
  const html = value.html.replace(/\{\{input:([^{}]+)\}\}/gu, (_match, name: string) => {
    const input = inputs[name];
    if (input === undefined || used.has(name)) throw new Error(`HTML visual input ${name} is missing or repeated.`);
    used.add(name);
    return input;
  });
  for (const name of Object.keys(inputs)) if (!used.has(name)) throw new Error(`HTML visual does not place input ${name}.`);
  return html;
}
