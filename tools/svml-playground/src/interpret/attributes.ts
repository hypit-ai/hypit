import type { MarkupAttributeValue, StructuredElement } from "@narratage/markup";

/** Attribute readers mirroring the per-package Surface decoders' own rules. */

export function optionalText(element: StructuredElement, name: string): string | undefined {
  const value: MarkupAttributeValue | undefined = element.attributes[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${element.name}.${name} must be text.`);
  }
  return value.trim();
}

export function text(element: StructuredElement, name: string): string {
  const value = optionalText(element, name);
  if (value === undefined) throw new Error(`${element.name} requires ${name}.`);
  return value;
}

export function positiveInteger(element: StructuredElement, name: string): number {
  const value = Number(text(element, name));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${element.name}.${name} must be a positive integer.`);
  }
  return value;
}

export function referencePath(element: StructuredElement, name: string): string | undefined {
  const value: MarkupAttributeValue | undefined = element.attributes[name];
  if (value === undefined || typeof value === "string") return undefined;
  return value.path;
}

export function requireReferencePath(element: StructuredElement, name: string): string {
  const path = referencePath(element, name);
  if (path === undefined) throw new Error(`${element.name}.${name} must be a reference.`);
  return path;
}

/**
 * Element children that are elements. Whitespace between authored tags is
 * ordinary trivia; anything else under a structured element is a mistake worth
 * naming rather than silently dropping.
 */
export function elementChildren(element: StructuredElement): readonly StructuredElement[] {
  const children: StructuredElement[] = [];
  for (const child of element.children) {
    if (child.kind === "element") children.push(child);
    else if (child.value.trim().length > 0) {
      throw new Error(`${element.name} does not accept text content.`);
    }
  }
  return children;
}
