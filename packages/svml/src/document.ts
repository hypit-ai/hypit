import type {
  AuthorDeclaration,
  AuthorDeclarationChild,
  AuthorDeclarationFieldValue,
  AuthorStructureContainer,
  AuthorStructureDeclarationDraft,
  AuthorStructureDocument,
  AuthorStructureFieldDraft,
  AuthorStructureFrontend,
  AuthorStructureImportDraft,
  AuthorStructureNode,
  AuthorStructureNodeDraft,
  AuthorStructureOperation,
  AuthorStructureRecordEntryDraft,
  AuthorStructureValueDraft,
} from "@hypit/generation-authoring/author";
import { createModuleRef, type ModuleRef } from "@hypit/module";
import { decodeSourceText, type SourceRange, type SourceUnit } from "@hypit/generation-authoring/source";

import { SvmlFrontendError } from "./error.js";
import { parseSvmlDocument } from "./parser.js";
import type {
  SvmlDeclarationSyntax,
  SvmlDocumentSyntax,
  SvmlFieldSyntax,
  SvmlImportSyntax,
  SvmlRecordEntrySyntax,
  SvmlValueSyntax,
} from "./types.js";

type TextEdit = {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly rank: number;
};

type LocatedNode = {
  readonly node: AuthorStructureNode;
  readonly range: SourceRange;
  readonly ownedRange: SourceRange;
  readonly indent: string;
  readonly syntax:
    | SvmlImportSyntax
    | SvmlDeclarationSyntax
    | SvmlFieldSyntax
    | SvmlValueSyntax
    | SvmlRecordEntrySyntax;
};

type LocatedContainer = {
  readonly container: AuthorStructureContainer;
  readonly insertAt: number;
  readonly indent: string;
  readonly multiline: boolean;
};

type SvmlStructureRepresentation = {
  readonly syntax: SvmlDocumentSyntax;
  readonly nodes: ReadonlyMap<string, LocatedNode>;
  readonly containers: ReadonlyMap<string, LocatedContainer>;
  readonly aliases: ReadonlyMap<string, ModuleRef>;
};

function moduleRef(from: string, source: SourceUnit, offset: number): ModuleRef {
  try {
    return createModuleRef(from);
  } catch {
    throw new SvmlFrontendError(
      "SVML_MODULE_NAME",
      `Module import ${JSON.stringify(from)} must be an unversioned logical package name.`,
      source.name,
      offset,
    );
  }
}

function lineIndent(text: string, offset: number): string {
  const line = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  return /^[ \t]*/u.exec(text.slice(line, offset))?.[0] ?? "";
}

function valueDraft(value: SvmlValueSyntax): AuthorStructureValueDraft {
  if (value.kind === "literal") return { kind: "literal", value: value.value, style: value.style };
  if (value.kind === "reference") return { kind: "reference", path: value.path };
  if (value.kind === "list") return { kind: "list", items: value.items.map(valueDraft) };
  return {
    kind: "record",
    entries: value.entries.map((entry) => ({ kind: "entry", name: entry.name, value: valueDraft(entry.value) })),
  };
}

function declarationValue(value: SvmlValueSyntax): AuthorDeclarationFieldValue {
  if (value.kind === "literal") return { kind: "literal", value: value.value, range: { ...value.range } };
  if (value.kind === "reference") return { kind: "reference", path: value.path, range: { ...value.range } };
  if (value.kind === "list") {
    return { kind: "list", items: value.items.map(declarationValue), range: { ...value.range } };
  }
  return {
    kind: "record",
    entries: value.entries.map((entry) => ({
      name: entry.name,
      value: declarationValue(entry.value),
      range: { ...entry.range },
    })),
    range: { ...value.range },
  };
}

function childDeclaration(value: SvmlDeclarationSyntax): AuthorDeclarationChild {
  return {
    name: value.name,
    ...(value.label === undefined ? {} : { label: value.label }),
    fields: value.fields.map((field) => ({ name: field.name, value: declarationValue(field.value) })),
    children: value.children.map(childDeclaration),
    range: { ...value.range },
  };
}

export function declarationsFromSvmlDocument(document: SvmlDocumentSyntax): readonly AuthorDeclaration[] {
  const aliases = new Map<string, ModuleRef>();
  for (const item of document.imports) {
    if (item.kind !== "module") continue;
    aliases.set(item.alias, moduleRef(item.from, document.source, item.range.start));
  }
  return document.declarations.map((declaration) => {
    const alias = declaration.moduleAlias!;
    const module = aliases.get(alias);
    if (module === undefined) {
      throw new SvmlFrontendError(
        "SVML_DECLARATION_MODULE",
        `Declaration ${alias}.${declaration.name} uses an unknown module alias.`,
        document.source.name,
        declaration.range.start,
      );
    }
    return {
      module,
      name: declaration.name,
      ...(declaration.label === undefined ? {} : { label: declaration.label }),
      fields: declaration.fields.map((field) => ({ name: field.name, value: declarationValue(field.value) })),
      children: declaration.children.map(childDeclaration),
      range: { ...declaration.range },
    };
  });
}

function project(source: SourceUnit): AuthorStructureDocument {
  const syntax = parseSvmlDocument(source);
  const text = syntax.text;
  const nodes: AuthorStructureNode[] = [];
  const containers: AuthorStructureContainer[] = [];
  const locatedNodes = new Map<string, LocatedNode>();
  const locatedContainers = new Map<string, LocatedContainer>();
  const aliases = new Map<string, ModuleRef>();

  const appendContainer = (value: AuthorStructureContainer, insertAt: number, indent: string,
    multiline: boolean): void => {
    containers.push(value);
    locatedContainers.set(value.container, { container: value, insertAt, indent, multiline });
  };
  const appendNode = (value: AuthorStructureNode, syntaxNode: LocatedNode["syntax"],
    ownedRange: SourceRange): void => {
    nodes.push(value);
    locatedNodes.set(value.node, {
      node: value,
      syntax: syntaxNode,
      range: { ...syntaxNode.range },
      ownedRange: { ...ownedRange },
      indent: lineIndent(text, syntaxNode.range.start),
    });
  };

  const importIds: string[] = [];
  for (const [index, item] of syntax.imports.entries()) {
    const id = `import:${index}`;
    importIds.push(id);
    appendNode({ node: id, kind: item.kind, alias: item.alias, from: item.from, range: { ...item.range } },
      item, item.ownedRange);
    if (item.kind === "module") aliases.set(item.alias, moduleRef(item.from, source, item.range.start));
  }
  const firstDeclaration = syntax.declarations[0];
  appendContainer({ container: "document:imports", kind: "imports", items: importIds },
    firstDeclaration?.ownedRange.start ?? text.length, "", true);

  const visitValue = (value: SvmlValueSyntax, id: string): string => {
    if (value.kind === "literal") {
      appendNode({ node: id, kind: "literal", value: value.value, style: value.style, range: { ...value.range } },
        value, value.ownedRange);
      return id;
    }
    if (value.kind === "reference") {
      appendNode({ node: id, kind: "reference", path: value.path, range: { ...value.range } },
        value, value.ownedRange);
      return id;
    }
    if (value.kind === "list") {
      const itemIds = value.items.map((item, index) => visitValue(item, `${id}/item:${index}`));
      appendContainer({ container: `${id}:items`, kind: "values", owner: id, items: itemIds },
        value.contentRange.end, `${lineIndent(text, value.range.start)}  `,
        text.slice(value.range.start, value.range.end).includes("\n"));
      appendNode({ node: id, kind: "list", items: `${id}:items`, range: { ...value.range } },
        value, value.ownedRange);
      return id;
    }
    const entryIds = value.entries.map((entry, index) => {
      const entryId = `${id}/entry:${index}`;
      const valueId = visitValue(entry.value, `${entryId}/value`);
      appendNode({ node: entryId, kind: "entry", name: entry.name, value: valueId, range: { ...entry.range } },
        entry, entry.ownedRange);
      return entryId;
    });
    appendContainer({ container: `${id}:entries`, kind: "entries", owner: id, items: entryIds },
      value.contentRange.end, `${lineIndent(text, value.range.start)}  `,
      text.slice(value.range.start, value.range.end).includes("\n"));
    appendNode({ node: id, kind: "record", entries: `${id}:entries`, range: { ...value.range } },
      value, value.ownedRange);
    return id;
  };

  const visitDeclaration = (declaration: SvmlDeclarationSyntax, id: string, module?: ModuleRef): string => {
    const fieldIds = declaration.fields.map((field, index) => {
      const fieldId = `${id}/field:${index}`;
      const valueId = visitValue(field.value, `${fieldId}/value`);
      appendNode({ node: fieldId, kind: "field", name: field.name, value: valueId, range: { ...field.range } },
        field, field.ownedRange);
      return fieldId;
    });
    const childIds = declaration.children.map((child, index) =>
      visitDeclaration(child, `${id}/child:${index}`));
    const fieldsInsertAt = declaration.children[0]?.ownedRange.start ?? declaration.contentRange.end;
    const childIndent = `${lineIndent(text, declaration.range.start)}  `;
    appendContainer({ container: `${id}:fields`, kind: "fields", owner: id, items: fieldIds },
      fieldsInsertAt, childIndent, true);
    appendContainer({ container: `${id}:children`, kind: "declarations", owner: id, items: childIds },
      declaration.contentRange.end, childIndent, true);
    let labelNode: string | undefined;
    if (declaration.label !== undefined && declaration.labelRange !== undefined) {
      labelNode = `${id}/label`;
      appendNode({ node: labelNode, kind: "label", value: declaration.label,
        range: { ...declaration.labelRange } }, declaration, declaration.labelRange);
    }
    appendNode({
      node: id,
      kind: "declaration",
      ...(module === undefined ? {} : { module }),
      name: declaration.name,
      ...(declaration.label === undefined ? {} : { label: declaration.label }),
      ...(labelNode === undefined ? {} : { labelNode }),
      fields: `${id}:fields`,
      children: `${id}:children`,
      range: { ...declaration.range },
    }, declaration, declaration.ownedRange);
    return id;
  };

  const declarationIds = syntax.declarations.map((declaration, index) => {
    const alias = declaration.moduleAlias!;
    const module = aliases.get(alias);
    if (module === undefined) {
      throw new SvmlFrontendError(
        "SVML_DECLARATION_MODULE",
        `Declaration ${alias}.${declaration.name} uses an unknown module alias.`,
        source.name,
        declaration.range.start,
      );
    }
    return visitDeclaration(declaration, `declaration:${index}`, module);
  });
  appendContainer({ container: "document:declarations", kind: "declarations", items: declarationIds },
    text.length, "", true);

  const representation: SvmlStructureRepresentation = {
    syntax,
    nodes: locatedNodes,
    containers: locatedContainers,
    aliases,
  };
  return {
    source,
    imports: "document:imports",
    declarations: "document:declarations",
    nodes,
    containers,
    representation,
  };
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function printValue(value: AuthorStructureValueDraft, indent: string): string {
  if (value.kind === "reference") return `@${value.path}`;
  if (value.kind === "literal") {
    if (value.style === "quoted") return quote(value.value);
    if (value.style === "raw") {
      let marker = "SVML";
      while (value.value.split(/\r?\n/u).some((line) => line.trim() === marker)) marker = `${marker}_`;
      const body = value.value.endsWith("\n") ? value.value : `${value.value}\n`;
      return `<<${marker}\n${body}${indent}${marker}\n`;
    }
    return value.value;
  }
  if (value.kind === "list") return `[${value.items.map((item) => printValue(item, indent)).join(", ")}]`;
  return `{ ${value.entries.map((entry) => `${entry.name}: ${printValue(entry.value, indent)}`).join(", ")} }`;
}

function moduleAlias(representation: SvmlStructureRepresentation, module: ModuleRef): string {
  for (const [alias, candidate] of representation.aliases) {
    if (candidate.name === module.name) return alias;
  }
  throw new Error(`Module ${module.name} is not imported by this SVML Source.`);
}

function printDeclaration(
  value: AuthorStructureDeclarationDraft,
  indent: string,
  representation: SvmlStructureRepresentation,
): string {
  const type = value.module === undefined
    ? value.name
    : `${moduleAlias(representation, value.module)}.${value.name}`;
  const label = value.label === undefined ? "" : ` ${quote(value.label)}`;
  const fields = value.fields.map((field) => `${indent}  ${field.name}: ${printValue(field.value, `${indent}  `)}`);
  const children = value.children.map((child) => printDeclaration(child, `${indent}  `, representation));
  const content = [...fields, ...children];
  if (content.length === 0) return `${indent}${type}${label} {}`;
  return `${indent}${type}${label} {\n${content.join("\n\n")}\n${indent}}`;
}

function printDraft(
  value: AuthorStructureNodeDraft,
  indent: string,
  representation: SvmlStructureRepresentation,
): string {
  if (value.kind === "module" || value.kind === "source") {
    return `${indent}${value.kind} ${value.alias} from ${quote(value.from)}`;
  }
  if (value.kind === "declaration") return printDeclaration(value, indent, representation);
  if (value.kind === "field") return `${indent}${value.name}: ${printValue(value.value, indent)}`;
  if (value.kind === "entry") return `${value.name}: ${printValue(value.value, indent)}`;
  if (value.kind === "label") return quote(value.value);
  return printValue(value, indent);
}

function compatible(container: AuthorStructureContainer, draft: AuthorStructureNodeDraft): boolean {
  if (container.kind === "imports") return draft.kind === "module" || draft.kind === "source";
  if (container.kind === "declarations") return draft.kind === "declaration";
  if (container.kind === "fields") return draft.kind === "field";
  if (container.kind === "entries") return draft.kind === "entry";
  return draft.kind === "literal" || draft.kind === "reference" || draft.kind === "list" || draft.kind === "record";
}

function compatibleReplacement(node: AuthorStructureNode, draft: AuthorStructureNodeDraft): boolean {
  if (node.kind === "module" || node.kind === "source") return draft.kind === node.kind;
  if (node.kind === "declaration") return draft.kind === "declaration";
  if (node.kind === "field") return draft.kind === "field";
  if (node.kind === "entry") return draft.kind === "entry";
  if (node.kind === "label") return draft.kind === "label";
  return draft.kind === "literal" || draft.kind === "reference" || draft.kind === "list" || draft.kind === "record";
}

function insertion(
  representation: SvmlStructureRepresentation,
  located: LocatedContainer,
  before: string | undefined,
  printed: string,
): { readonly offset: number; readonly text: string } {
  const { container } = located;
  const beforeNode = before === undefined ? undefined : representation.nodes.get(before);
  if (before !== undefined && (beforeNode === undefined || !container.items.includes(before))) {
    throw new Error(`Node ${before} is not inside container ${container.container}.`);
  }
  const offset = beforeNode?.ownedRange.start ?? located.insertAt;
  if (container.kind === "values" || container.kind === "entries") {
    if (container.items.length === 0) return { offset, text: printed };
    return beforeNode === undefined
      ? { offset, text: `, ${printed}` }
      : { offset, text: `${printed}, ` };
  }
  const hasItems = container.items.length > 0;
  if (container.kind === "imports") {
    return { offset, text: `${printed}\n` };
  }
  if (container.container === "document:declarations") {
    const prefix = offset === 0 || representation.syntax.text.slice(0, offset).endsWith("\n\n") ? "" : "\n";
    const suffix = offset >= representation.syntax.text.length ? "\n" : "\n";
    return { offset, text: `${prefix}${printed}${suffix}` };
  }
  if (!hasItems) return { offset, text: `\n${printed}\n${located.indent.slice(0, -2)}` };
  return beforeNode === undefined
    ? { offset, text: `\n${printed}` }
    : { offset, text: `${printed}\n` };
}

function applyTextEdits(source: string, edits: readonly TextEdit[]): string {
  const groupedInsertions = new Map<number, TextEdit[]>();
  const replacements: TextEdit[] = [];
  for (const edit of edits) {
    if (edit.start === edit.end) {
      const group = groupedInsertions.get(edit.start) ?? [];
      group.push(edit);
      groupedInsertions.set(edit.start, group);
    } else replacements.push(edit);
  }
  for (const [offset, group] of groupedInsertions) {
    replacements.push({
      start: offset,
      end: offset,
      text: group.sort((left, right) => left.rank - right.rank).map((item) => item.text).join(""),
      rank: 0,
    });
  }
  const ordered = replacements.sort((left, right) => right.start - left.start || right.end - left.end);
  let boundary = source.length;
  let result = source;
  for (const edit of ordered) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > source.length || edit.end > boundary) {
      throw new Error("SVML structure operations overlap or address an invalid range.");
    }
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`;
    boundary = edit.start;
  }
  return result;
}

function removalRange(
  representation: SvmlStructureRepresentation,
  owner: LocatedContainer,
  node: string,
): SourceRange {
  const located = representation.nodes.get(node)!;
  if (owner.container.kind !== "values" && owner.container.kind !== "entries") {
    return located.ownedRange;
  }
  const index = owner.container.items.indexOf(node);
  const next = owner.container.items[index + 1];
  if (next !== undefined) {
    return { start: located.ownedRange.start, end: representation.nodes.get(next)!.ownedRange.start };
  }
  const previous = owner.container.items[index - 1];
  if (previous !== undefined) {
    return { start: representation.nodes.get(previous)!.range.end, end: located.ownedRange.end };
  }
  return located.ownedRange;
}

function reindent(raw: string, from: string, to: string): string {
  if (from === to || !raw.includes("\n")) return raw;
  return raw.split("\n").map((line, index) => {
    if (index === 0 || line.length === 0) return line;
    return line.startsWith(from) ? `${to}${line.slice(from.length)}` : line;
  }).join("\n");
}

function editsFor(
  document: AuthorStructureDocument,
  operations: readonly AuthorStructureOperation[],
): readonly TextEdit[] {
  const representation = document.representation as SvmlStructureRepresentation;
  const source = representation.syntax.text;
  const edits: TextEdit[] = [];
  for (const [rank, operation] of operations.entries()) {
    if (operation.kind === "insert") {
      const container = representation.containers.get(operation.container);
      if (container === undefined) throw new Error(`Unknown Author Structure container ${operation.container}.`);
      if (!compatible(container.container, operation.value)) {
        throw new Error(`${operation.value.kind} cannot be inserted into ${container.container.kind}.`);
      }
      const printed = printDraft(operation.value, container.indent, representation);
      const value = insertion(representation, container, operation.before, printed);
      edits.push({ start: value.offset, end: value.offset, text: value.text, rank });
      continue;
    }
    const located = representation.nodes.get(operation.node);
    if (located === undefined) throw new Error(`Unknown Author Structure node ${operation.node}.`);
    if (operation.kind === "replace") {
      if (!compatibleReplacement(located.node, operation.value)) {
        throw new Error(`${operation.value.kind} cannot replace ${located.node.kind}.`);
      }
      edits.push({ start: located.range.start, end: located.range.end,
        text: printDraft(operation.value, located.indent, representation), rank });
      continue;
    }
    const owner = [...representation.containers.values()]
      .find((candidate) => candidate.container.items.includes(operation.node));
    if (owner === undefined) throw new Error(`Node ${operation.node} is not removable or movable.`);
    if (operation.kind === "remove") {
      const removal = removalRange(representation, owner, operation.node);
      edits.push({ start: removal.start, end: removal.end, text: "", rank });
      continue;
    }
    const target = representation.containers.get(operation.container);
    if (target === undefined) throw new Error(`Unknown Author Structure container ${operation.container}.`);
    const draftKind = located.node.kind;
    const targetAccepts = target.container.kind === owner.container.kind
      || (target.container.kind === "declarations" && draftKind === "declaration");
    if (!targetAccepts) throw new Error(`${draftKind} cannot move into ${target.container.kind}.`);
    if (target.container.container === owner.container.container) {
      const index = owner.container.items.indexOf(operation.node);
      const next = owner.container.items[index + 1];
      if ((operation.before === undefined && index === owner.container.items.length - 1)
        || operation.before === next) continue;
    }
    const before = operation.before === undefined ? undefined : representation.nodes.get(operation.before);
    if (before?.node.node === operation.node) throw new Error("A node cannot move before itself.");
    const raw = reindent(source.slice(located.range.start, located.range.end), located.indent, target.indent);
    const inserted = insertion(representation, target, operation.before, raw);
    if (inserted.offset >= located.ownedRange.start && inserted.offset <= located.ownedRange.end) {
      throw new Error("A node cannot move inside its own source range.");
    }
    const removal = removalRange(representation, owner, operation.node);
    edits.push({ start: removal.start, end: removal.end, text: "", rank });
    edits.push({ start: inserted.offset, end: inserted.offset, text: inserted.text, rank });
  }
  return edits;
}

export const svmlStructureFrontend: AuthorStructureFrontend = {
  async openStructure(source) {
    return project(source);
  },
  async applyStructureOperations(document, operations) {
    const text = applyTextEdits(decodeSourceText(document.source), editsFor(document, operations));
    const candidate = { ...document.source, bytes: new TextEncoder().encode(text) };
    // Never return unparseable candidate bytes from a structural operation.
    parseSvmlDocument(candidate);
    return candidate;
  },
};

export function structureValueDraft(value: SvmlValueSyntax): AuthorStructureValueDraft {
  return valueDraft(value);
}

export function structureFieldDraft(value: SvmlFieldSyntax): AuthorStructureFieldDraft {
  return { kind: "field", name: value.name, value: valueDraft(value.value) };
}

export function structureDeclarationDraft(
  value: SvmlDeclarationSyntax,
  module?: ModuleRef,
): AuthorStructureDeclarationDraft {
  return {
    kind: "declaration",
    ...(module === undefined ? {} : { module }),
    name: value.name,
    ...(value.label === undefined ? {} : { label: value.label }),
    fields: value.fields.map(structureFieldDraft),
    children: value.children.map((child) => structureDeclarationDraft(child)),
  };
}

export function moduleImportDraft(alias: string, from: string): AuthorStructureImportDraft {
  return { kind: "module", alias, from };
}

export function recordEntryDraft(name: string, value: AuthorStructureValueDraft): AuthorStructureRecordEntryDraft {
  return { kind: "entry", name, value };
}
