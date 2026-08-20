import type { StructuredElement } from "./types.js";

export function assertAttributes(
  element: StructuredElement,
  allowed: readonly string[],
  required: readonly string[] = [],
): void {
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) throw new Error(`${element.name} does not accept ${unknown[0]}.`);
  const missing = required.filter((name) => element.attributes[name] === undefined);
  if (missing.length > 0) throw new Error(`${element.name} requires ${missing.join(", ")}.`);
}

export function assertExactAttributes(element: StructuredElement, names: readonly string[]): void {
  assertAttributes(element, names, names);
}

export function assertEmptyElement(element: StructuredElement): void {
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} must be empty.`);
  }
}

export function localName(name: string): string {
  return name.slice(name.lastIndexOf(":") + 1);
}

export function textAttribute(element: StructuredElement, name: string, fallback?: string): string {
  const value = element.attributes[name];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${element.name}.${name} must be text.`);
  }
  return value.trim();
}

export function optionalTextAttribute(element: StructuredElement, name: string): string | undefined {
  return element.attributes[name] === undefined ? undefined : textAttribute(element, name);
}
