import type { AttributeValue, SourceElement, SourceNode } from "../model.js";

export function childElements(element: SourceElement, name?: string): SourceElement[] {
  return element.children.filter(
    (child): child is SourceElement =>
      child.kind === "element" && (name === undefined || child.name === name),
  );
}

export function textContent(element: SourceElement): string {
  return element.children
    .map((child) => child.kind === "text" ? child.value : textContent(child))
    .join("");
}

export function attributeString(
  element: SourceElement,
  name: string,
  fallback?: string,
): string {
  const value = element.attributes[name];
  if (typeof value === "string") return value;
  if (value === undefined && fallback !== undefined) return fallback;
  throw new Error(`<${element.name}> requires string attribute "${name}"`);
}

export function attributeNumber(
  element: SourceElement,
  name: string,
  fallback?: number,
): number {
  const value = element.attributes[name];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (value === undefined && fallback !== undefined) return fallback;
  throw new Error(`<${element.name}> requires numeric attribute "${name}"`);
}

export function attributeBoolean(
  element: SourceElement,
  name: string,
  fallback?: boolean,
): boolean {
  const value = element.attributes[name];
  if (typeof value === "boolean") return value;
  if (value === undefined && fallback !== undefined) return fallback;
  throw new Error(`<${element.name}> requires boolean attribute "${name}"`);
}

export function attributeReference(element: SourceElement, name: string): string {
  const value = element.attributes[name];
  if (value && typeof value === "object" && value.kind === "reference") return value.path;
  throw new Error(`<${element.name}> requires reference attribute "${name}"`);
}

export function referencePath(value: AttributeValue | undefined): string | undefined {
  return value && typeof value === "object" && value.kind === "reference"
    ? value.path
    : undefined;
}

export function walkElements(nodes: SourceNode[]): SourceElement[] {
  const output: SourceElement[] = [];
  for (const node of nodes) {
    if (node.kind !== "element") continue;
    output.push(node, ...walkElements(node.children));
  }
  return output;
}
