import type {
  InvocationSourceDocument,
  InvocationRequestOverride,
} from "@hypit/invocation";
import {
  parseStructuredElement,
  skipTextTrivia,
} from "@hypit/markup";
import type {
  MarkupSource,
  StructuredElement,
} from "@hypit/markup";

export class InvocationSyntaxError extends Error {
  readonly code: string;
  readonly offset: number;
  readonly sourceName: string | undefined;
  readonly line: number | undefined;
  readonly column: number | undefined;

  constructor(code: string, message: string, offset: number, sourceName?: string, source?: string) {
    const before = source === undefined ? undefined : source.slice(0, offset);
    const line = before === undefined ? undefined : before.split("\n").length;
    const column = before === undefined ? undefined : [...(before.split("\n").at(-1) ?? "")].length + 1;
    super(sourceName === undefined || line === undefined ? message : `${sourceName}:${line}:${column}: ${message}`);
    this.name = "InvocationSyntaxError";
    this.code = code;
    this.offset = offset;
    this.sourceName = sourceName;
    this.line = line;
    this.column = column;
  }
}

function fail(element: StructuredElement, code: string, message: string): never {
  throw new InvocationSyntaxError(code, message, element.range.start);
}

function elements(element: StructuredElement): readonly StructuredElement[] {
  const result: StructuredElement[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) fail(element, "INVOCATION_TEXT", `<${element.name}> only accepts elements`);
      continue;
    }
    result.push(child);
  }
  return result;
}

function exactAttributes(element: StructuredElement, allowed: readonly string[]): void {
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) fail(element, "INVOCATION_ATTRIBUTE", `<${element.name}> does not accept ${unknown[0]}`);
}

function stringAttribute(element: StructuredElement, name: string, required = true): string | undefined {
  const value = element.attributes[name];
  if (value === undefined) {
    if (required) fail(element, "INVOCATION_ATTRIBUTE", `<${element.name}> requires ${name}`);
    return undefined;
  }
  if (typeof value !== "string") fail(element, "INVOCATION_ATTRIBUTE", `<${element.name}> ${name} must be a string`);
  const normalized = value.trim();
  if (normalized.length === 0) fail(element, "INVOCATION_ATTRIBUTE", `<${element.name}> ${name} must not be empty`);
  return normalized;
}

function empty(element: StructuredElement): void {
  if (elements(element).length > 0) fail(element, "INVOCATION_CHILD", `<${element.name}> must be empty`);
}

function authorDeclaration(element: StructuredElement): { readonly source: string } {
  exactAttributes(element, ["source"]);
  empty(element);
  return { source: stringAttribute(element, "source")! };
}

function target(element: StructuredElement): string {
  exactAttributes(element, ["output"]);
  empty(element);
  return stringAttribute(element, "output")!;
}

function override(element: StructuredElement): InvocationRequestOverride {
  exactAttributes(element, ["output", "primary", "record"]);
  empty(element);
  const output = stringAttribute(element, "output")!;
  const primary = stringAttribute(element, "primary", false);
  const record = stringAttribute(element, "record", false);
  if ((primary === undefined) === (record === undefined)) {
    fail(element, "INVOCATION_OVERRIDE_CHOICE", `<override> ${output} requires exactly one of primary or record`);
  }
  if (primary !== undefined && primary !== "true") {
    fail(element, "INVOCATION_OVERRIDE_PRIMARY", `<override> ${output} primary must be true`);
  }
  return {
    output,
    choice: record === undefined ? { kind: "primary" } : { kind: "record", record },
  };
}

function unique(values: readonly string[], subject: string, element: StructuredElement): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) fail(element, "INVOCATION_DUPLICATE", `${subject} repeats ${value}`);
    seen.add(value);
  }
}

/** Parse one saved Invocation Source. No package code, Runtime or Provider executes here. */
function parseInvocationSourceDocumentBody(name: string, text: string): InvocationSourceDocument {
  const source: MarkupSource = { name, text };
  const start = skipTextTrivia(source, 0);
  const parsed = parseStructuredElement(source, start);
  const end = skipTextTrivia(source, parsed.nextOffset);
  if (end !== text.length) throw new InvocationSyntaxError("INVOCATION_TRAILING", "Only trivia may follow </svrun>", end);
  const root = parsed.element;
  if (root.name !== "svrun") fail(root, "INVOCATION_ROOT", "Invocation Source root must be <svrun>");
  exactAttributes(root, ["version"]);
  if (stringAttribute(root, "version") !== "1") fail(root, "INVOCATION_VERSION", "Only .svrun version 1 is supported");

  let author: { readonly source: string } | undefined;
  const targets: string[] = [];
  const overrides: InvocationRequestOverride[] = [];
  const overriddenOutputs = new Set<string>();
  for (const child of elements(root)) {
    if (child.name === "author") {
      if (author !== undefined) {
        fail(child, "INVOCATION_AUTHOR_ORDER", "<author> must be the first and only Author declaration");
      }
      author = authorDeclaration(child);
      continue;
    }
    if (author === undefined) fail(child, "INVOCATION_AUTHOR_MISSING", "<svrun> requires an opening <author> declaration");
    if (child.name === "target") targets.push(target(child));
    else if (child.name === "override") {
      const item = override(child);
      if (overriddenOutputs.has(item.output)) {
        fail(child, "INVOCATION_OVERRIDE_DUPLICATE", `<override> repeats output ${item.output}`);
      }
      overriddenOutputs.add(item.output);
      overrides.push(item);
    }
    else fail(child, "INVOCATION_CHILD", `<svrun> does not accept <${child.name}>`);
  }
  if (author === undefined) fail(root, "INVOCATION_AUTHOR_MISSING", "<svrun> requires exactly one <author> declaration");

  unique(targets, "Invocation target", root);
  if (targets.length === 0) fail(root, "INVOCATION_TARGETS", "<svrun> requires at least one <target>");
  return {
    format: "hypit.invocation-source@1",
    author,
    targets,
    overrides,
  };
}

export function parseInvocationSourceDocument(name: string, text: string): InvocationSourceDocument {
  try {
    return parseInvocationSourceDocumentBody(name, text);
  } catch (error) {
    if (error instanceof InvocationSyntaxError && error.sourceName === undefined) {
      throw new InvocationSyntaxError(error.code, error.message, error.offset, name, text);
    }
    throw error;
  }
}
