import type { TypeRef } from "@narratage/protocol";
import type {
  RunBuildRecord,
  RunCandidateDeclaration,
  RunDocument,
  RunFragmentInstance,
  RunImport,
  RunProvidedFile,
  RunProvidedValue,
  RunSatisfaction,
  RunTarget,
} from "@narratage/run";
import {
  parseStructuredElement,
  skipTextTrivia,
} from "@narratage/markup";
import type {
  MarkupSource,
  StructuredElement,
} from "@narratage/markup";

export class RunSyntaxError extends Error {
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
    this.name = "RunSyntaxError";
    this.code = code;
    this.offset = offset;
    this.sourceName = sourceName;
    this.line = line;
    this.column = column;
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

function parseTypeRef(value: string): TypeRef {
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

function target(element: StructuredElement): RunTarget {
  exactAttributes(element, ["output"]);
  empty(element);
  return { output: stringAttribute(element, "output")! };
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

function file(element: StructuredElement): RunProvidedFile {
  exactAttributes(element, ["id", "type", "from", "media-type"]);
  empty(element);
  let type: TypeRef;
  try {
    type = parseTypeRef(stringAttribute(element, "type")!);
  } catch (error) {
    fail(element, "RUN_TYPE", error instanceof Error ? error.message : String(error));
  }
  const mediaType = stringAttribute(element, "media-type")!;
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(mediaType)) {
    fail(element, "RUN_MEDIA_TYPE", "<file> media-type must be a concrete MIME media type");
  }
  return {
    kind: "file",
    id: stringAttribute(element, "id")!,
    type,
    from: stringAttribute(element, "from")!,
    mediaType,
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
  exactAttributes(element, ["output", "candidate"]);
  empty(element);
  return {
    output: stringAttribute(element, "output")!,
    candidate: stringAttribute(element, "candidate")!,
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
function parseRunDocumentBody(name: string, text: string): RunDocument {
  const source: MarkupSource = { name, text };
  const start = skipTextTrivia(source, 0);
  const parsed = parseStructuredElement(source, start);
  const end = skipTextTrivia(source, parsed.nextOffset);
  if (end !== text.length) throw new RunSyntaxError("RUN_TRAILING", "Only trivia may follow </svrun>", end);
  const root = parsed.element;
  if (root.name !== "svrun") fail(root, "RUN_ROOT", "Run document root must be <svrun>");
  exactAttributes(root, ["version"]);
  if (stringAttribute(root, "version") !== "1") fail(root, "RUN_VERSION", "Only .svrun version 1 is supported");

  let author: { readonly source: string } | undefined;
  const imports: RunImport[] = [];
  const targets: RunTarget[] = [];
  const candidates: RunCandidateDeclaration[] = [];
  const satisfactions: RunSatisfaction[] = [];
  const satisfiedOutputs = new Set<string>();
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
    if (child.name === "target") targets.push(target(child));
    else if (child.name === "value") candidates.push(provided(child));
    else if (child.name === "file") candidates.push(file(child));
    else if (child.name === "build-record") candidates.push(buildRecord(child));
    else if (child.name === "fragment") candidates.push(fragment(child));
    else if (child.name === "satisfy") {
      const item = satisfaction(child);
      if (satisfiedOutputs.has(item.output)) {
        fail(child, "RUN_SATISFACTION_DUPLICATE", `<satisfy> repeats output ${item.output}`);
      }
      satisfiedOutputs.add(item.output);
      satisfactions.push(item);
    }
    else fail(child, "RUN_CHILD", `<svrun> does not accept <${child.name}>`);
  }
  if (author === undefined) fail(root, "RUN_AUTHOR_MISSING", "<svrun> requires exactly one <author> declaration");

  unique(imports.map((item) => item.as), "Run import alias", root);
  unique(candidates.map((item) => item.id), "Candidate declaration", root);
  unique(targets.map((item) => item.output), "Run target", root);
  if (targets.length === 0) fail(root, "RUN_TARGETS", "<svrun> requires at least one <target>");
  return {
    format: "svml.run-document@1",
    author,
    imports,
    targets,
    candidates,
    satisfactions,
  };
}

export function parseRunDocument(name: string, text: string): RunDocument {
  try {
    return parseRunDocumentBody(name, text);
  } catch (error) {
    if (error instanceof RunSyntaxError && error.sourceName === undefined) {
      throw new RunSyntaxError(error.code, error.message, error.offset, name, text);
    }
    throw error;
  }
}
