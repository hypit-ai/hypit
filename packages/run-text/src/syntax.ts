import type { TypeRef } from "@svml/protocol";
import type {
  RunBuildRecord,
  RunCandidateDeclaration,
  RunDocument,
  RunFragmentInstance,
  RunImport,
  RunProvidedValue,
  RunSatisfaction,
  RunTargetSet,
} from "@svml/run";
import {
  parseStructuredElement,
  skipTextTrivia,
} from "@svml/text";
import type {
  SourceUnit,
  StructuredElement,
} from "@svml/text";

export class RunSyntaxError extends Error {
  readonly code: string;
  readonly offset: number;

  constructor(code: string, message: string, offset: number) {
    super(message);
    this.name = "RunSyntaxError";
    this.code = code;
    this.offset = offset;
  }
}

function fail(element: StructuredElement, code: string, message: string): never {
  throw new RunSyntaxError(code, message, element.range.start);
}

function elements(element: StructuredElement): readonly StructuredElement[] {
  const result: StructuredElement[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) fail(element, "RUN_TEXT", `<${element.name}> only accepts elements`);
      continue;
    }
    result.push(child);
  }
  return result;
}

function exactAttributes(element: StructuredElement, allowed: readonly string[]): void {
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) fail(element, "RUN_ATTRIBUTE", `<${element.name}> does not accept ${unknown[0]}`);
}

function stringAttribute(element: StructuredElement, name: string, required = true): string | undefined {
  const value = element.attributes[name];
  if (value === undefined) {
    if (required) fail(element, "RUN_ATTRIBUTE", `<${element.name}> requires ${name}`);
    return undefined;
  }
  if (typeof value !== "string") fail(element, "RUN_ATTRIBUTE", `<${element.name}> ${name} must be a string`);
  const normalized = value.trim();
  if (normalized.length === 0) fail(element, "RUN_ATTRIBUTE", `<${element.name}> ${name} must not be empty`);
  return normalized;
}

function empty(element: StructuredElement): void {
  if (elements(element).length > 0) fail(element, "RUN_CHILD", `<${element.name}> must be empty`);
}

function conformance(element: StructuredElement, name: string): "exact" | "substitute" {
  const value = stringAttribute(element, name);
  if (value !== "exact" && value !== "substitute") {
    fail(element, "RUN_CONFORMANCE", `<${element.name}> ${name} must be exact or substitute`);
  }
  return value;
}

export function parseTypeRef(value: string): TypeRef {
  const hash = value.lastIndexOf("#");
  const version = hash <= 0 ? -1 : value.lastIndexOf("@", hash);
  if (hash <= 0 || version <= 0 || version === hash - 1 || hash === value.length - 1) {
    throw new Error(`Type ${value} must use package@version#Type`);
  }
  return {
    module: { name: value.slice(0, version), version: value.slice(version + 1, hash) },
    name: value.slice(hash + 1),
  };
}

function authorDeclaration(element: StructuredElement): { readonly source: string } {
  exactAttributes(element, ["source"]);
  empty(element);
  return { source: stringAttribute(element, "source")! };
}

function importDeclaration(element: StructuredElement): RunImport {
  exactAttributes(element, ["from", "as"]);
  empty(element);
  return { from: stringAttribute(element, "from")!, as: stringAttribute(element, "as")! };
}

function targetSet(element: StructuredElement): RunTargetSet {
  exactAttributes(element, ["id"]);
  const targets = elements(element).map((child) => {
    if (child.name !== "target") fail(child, "RUN_CHILD", `<target-set> does not accept <${child.name}>`);
    exactAttributes(child, ["output", "accepts"]);
    empty(child);
    return { output: stringAttribute(child, "output")!, accepts: conformance(child, "accepts") };
  });
  if (targets.length === 0) fail(element, "RUN_TARGETS", `<target-set> must contain at least one target`);
  return { id: stringAttribute(element, "id")!, targets };
}

function provided(element: StructuredElement): RunProvidedValue {
  exactAttributes(element, ["id", "type", "from"]);
  empty(element);
  let type: TypeRef;
  try {
    type = parseTypeRef(stringAttribute(element, "type")!);
  } catch (error) {
    fail(element, "RUN_TYPE", error instanceof Error ? error.message : String(error));
  }
  return {
    kind: "provided",
    id: stringAttribute(element, "id")!,
    type,
    from: stringAttribute(element, "from")!,
  };
}

function buildRecord(element: StructuredElement): RunBuildRecord {
  exactAttributes(element, ["id", "build", "output"]);
  empty(element);
  return {
    kind: "build-record",
    id: stringAttribute(element, "id")!,
    build: stringAttribute(element, "build")!,
    output: stringAttribute(element, "output")!,
  };
}

function fragment(element: StructuredElement): RunFragmentInstance {
  exactAttributes(element, ["id", "using"]);
  const using = stringAttribute(element, "using")!;
  const separator = using.indexOf(":");
  if (separator <= 0 || separator === using.length - 1) {
    fail(element, "RUN_FRAGMENT_REF", `<fragment> using must be alias:fragment`);
  }
  const inputs: { readonly name: string; readonly from: string }[] = [];
  const exports: string[] = [];
  for (const child of elements(element)) {
    if (child.name === "input") {
      exactAttributes(child, ["name", "from"]);
      empty(child);
      inputs.push({ name: stringAttribute(child, "name")!, from: stringAttribute(child, "from")! });
      continue;
    }
    if (child.name === "export") {
      exactAttributes(child, ["name"]);
      empty(child);
      exports.push(stringAttribute(child, "name")!);
      continue;
    }
    fail(child, "RUN_CHILD", `<fragment> does not accept <${child.name}>`);
  }
  unique(inputs.map((item) => item.name), `${stringAttribute(element, "id")} Fragment input`, element);
  unique(exports, `${stringAttribute(element, "id")} Fragment export`, element);
  return {
    kind: "fragment",
    id: stringAttribute(element, "id")!,
    using: { alias: using.slice(0, separator), name: using.slice(separator + 1) },
    inputs,
    ...(exports.length === 0 ? {} : { exports }),
  };
}

function satisfaction(element: StructuredElement): RunSatisfaction {
  exactAttributes(element, ["output", "candidate", "fidelity"]);
  empty(element);
  return {
    output: stringAttribute(element, "output")!,
    candidate: stringAttribute(element, "candidate")!,
    fidelity: conformance(element, "fidelity"),
  };
}

function unique(values: readonly string[], subject: string, element: StructuredElement): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) fail(element, "RUN_DUPLICATE", `${subject} repeats ${value}`);
    seen.add(value);
  }
}

/** Parse only the public Run language. No package code, Runtime or Provider executes here. */
export function parseRunDocument(name: string, text: string): RunDocument {
  const source: SourceUnit = { name, text };
  const start = skipTextTrivia(source, 0);
  const parsed = parseStructuredElement(source, start);
  const end = skipTextTrivia(source, parsed.nextOffset);
  if (end !== text.length) throw new RunSyntaxError("RUN_TRAILING", "Only trivia may follow </svrun>", end);
  const root = parsed.element;
  if (root.name !== "svrun") fail(root, "RUN_ROOT", "Run document root must be <svrun>");
  exactAttributes(root, ["version", "targets"]);
  if (stringAttribute(root, "version") !== "1") fail(root, "RUN_VERSION", "Only .svrun version 1 is supported");

  let author: { readonly source: string } | undefined;
  const imports: RunImport[] = [];
  const targetSets: RunTargetSet[] = [];
  const candidates: RunCandidateDeclaration[] = [];
  const satisfactions: RunSatisfaction[] = [];
  let bodyStarted = false;
  for (const child of elements(root)) {
    if (child.name === "author") {
      if (bodyStarted || author !== undefined || imports.length > 0) {
        fail(child, "RUN_AUTHOR_ORDER", "<author> must be the first and only Author declaration");
      }
      author = authorDeclaration(child);
      continue;
    }
    if (child.name === "import") {
      if (bodyStarted) fail(child, "RUN_IMPORT_ORDER", "Run imports must form the opening prologue");
      if (author === undefined) fail(child, "RUN_AUTHOR_ORDER", "<author> must precede Run imports");
      imports.push(importDeclaration(child));
      continue;
    }
    bodyStarted = true;
    if (author === undefined) fail(child, "RUN_AUTHOR_MISSING", "<svrun> requires an opening <author> declaration");
    if (child.name === "target-set") targetSets.push(targetSet(child));
    else if (child.name === "value") candidates.push(provided(child));
    else if (child.name === "build-record") candidates.push(buildRecord(child));
    else if (child.name === "fragment") candidates.push(fragment(child));
    else if (child.name === "satisfy") satisfactions.push(satisfaction(child));
    else fail(child, "RUN_CHILD", `<svrun> does not accept <${child.name}>`);
  }
  if (author === undefined) fail(root, "RUN_AUTHOR_MISSING", "<svrun> requires exactly one <author> declaration");

  unique(imports.map((item) => item.as), "Run import alias", root);
  unique(targetSets.map((item) => item.id), "Target set", root);
  unique(candidates.map((item) => item.id), "Candidate declaration", root);
  for (const set of targetSets) unique(set.targets.map((item) => item.output), `${set.id} target`, root);
  const selectedTargets = stringAttribute(root, "targets")!;
  if (!targetSets.some((item) => item.id === selectedTargets)) {
    fail(root, "RUN_TARGET_SET", `Selected target set ${selectedTargets} is not declared`);
  }
  return {
    format: "svml.run-document@1",
    author,
    selectedTargets,
    imports,
    targetSets,
    candidates,
    satisfactions,
  };
}
