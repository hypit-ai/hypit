import type {
  AuthorDeclarationRegistryLike,
  AuthorResolvedReference,
  AuthorSourceAssetRequest,
  DecodedAuthorSource,
  ResolvedAuthorSourceImport,
  AuthorDeclarationChild,
  AuthorDeclarationBodyPart,
  AuthorDeclarationDraft,
  AuthorDeclarationFieldValue,
  AuthorDocument,
  AuthorDocumentDeclaration,
  AuthorDocumentFrontend,
  AuthorDocumentImport,
  AuthorDocumentOperation,
  AuthorFrontend,
} from "@hypit/author";
import { compileAuthorDeclarations } from "@hypit/author";
import type { BlobRef } from "@hypit/protocol";
import { moduleKey, type ModuleRef } from "@hypit/protocol";
import { decodeSourceText, type SourceRange, type SourceUnit } from "@hypit/source";

import { MarkupFrontendError } from "./error.js";
import type {
  MarkupDeclarationRegistryLike,
  RegisteredMarkupDeclaration,
} from "./declaration-registry.js";
import { closeDocument, discoverMarkup, parseOpeningTag, type MarkupAttributeSyntax, type OpeningTag } from "./syntax.js";
import type {
  MarkupImportRequest,
  MarkupSource,
} from "./types.js";

export type MarkupDocumentText = {
  readonly kind: "text";
  readonly node: string;
  readonly range: SourceRange;
};

export type MarkupDocumentComment = {
  readonly kind: "comment";
  readonly node: string;
  readonly range: SourceRange;
};

export type MarkupDocumentElement = {
  readonly kind: "element";
  readonly node: string;
  readonly name: string;
  readonly opening: OpeningTag;
  readonly closing?: SourceRange;
  readonly children: readonly MarkupDocumentNode[];
  readonly range: SourceRange;
  /** Leading root/container trivia owned by this declaration for move/delete. */
  readonly ownedRange: SourceRange;
  readonly opaque: boolean;
};

export type MarkupDocumentNode = MarkupDocumentText | MarkupDocumentComment | MarkupDocumentElement;

export type MarkupDocument = {
  readonly source: MarkupSource;
  readonly root: MarkupDocumentElement;
  readonly imports: readonly { readonly request: MarkupImportRequest; readonly element: MarkupDocumentElement }[];
  readonly declarations: readonly MarkupDocumentElement[];
};

export type MarkupDocumentFrontendOptions = {
  readonly resolveModule: (request: MarkupImportRequest) => ModuleRef;
  readonly declarations: MarkupDeclarationRegistryLike;
};

type ParseOptions = {
  readonly opaqueTags?: ReadonlySet<string>;
};

function fail(source: MarkupSource, code: string, message: string, offset?: number): never {
  throw new MarkupFrontendError(code, message, source.name, offset, source.text);
}

function parseClose(
  source: MarkupSource,
  start: number,
): { readonly name: string; readonly range: SourceRange } {
  if (!source.text.startsWith("</", start)) fail(source, "MARKUP_CLOSE", "Expected a closing tag.", start);
  const end = source.text.indexOf(">", start + 2);
  if (end < 0) fail(source, "MARKUP_CLOSE", "Unclosed closing tag.", start);
  const name = source.text.slice(start + 2, end).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(name)) fail(source, "MARKUP_CLOSE", "Malformed closing tag.", start);
  return { name, range: { start, end: end + 1 } };
}

function findOpaqueClose(source: MarkupSource, name: string, start: number): SourceRange {
  const token = `</${name}>`;
  let cursor = start;
  while (cursor < source.text.length) {
    if (source.text[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (source.text.startsWith("<!--", cursor)) {
      const end = source.text.indexOf("-->", cursor + 4);
      if (end < 0) fail(source, "MARKUP_COMMENT", "Unclosed comment.", cursor);
      cursor = end + 3;
      continue;
    }
    if (source.text.startsWith(token, cursor)) return { start: cursor, end: cursor + token.length };
    cursor += 1;
  }
  fail(source, "MARKUP_ELEMENT_UNCLOSED", `<${name}> is not closed.`, start);
}

function assignOwnedRanges(children: readonly MarkupDocumentNode[], contentStart: number): readonly MarkupDocumentNode[] {
  let triviaStart = contentStart;
  return children.map((child) => {
    if (child.kind !== "element") return child;
    const owned = { start: triviaStart, end: child.range.end };
    triviaStart = child.range.end;
    return { ...child, ownedRange: owned };
  });
}

function parseElement(
  source: MarkupSource,
  start: number,
  path: string,
  options: ParseOptions,
): MarkupDocumentElement {
  const opening = parseOpeningTag(source, start);
  if (opening.selfClosing) {
    return {
      kind: "element",
      node: path,
      name: opening.name,
      opening,
      children: [],
      range: { start, end: opening.end },
      ownedRange: { start, end: opening.end },
      opaque: false,
    };
  }
  if (options.opaqueTags?.has(opening.name) === true) {
    const closing = findOpaqueClose(source, opening.name, opening.end);
    return {
      kind: "element",
      node: path,
      name: opening.name,
      opening,
      closing,
      children: [{ kind: "text", node: `${path}/body`, range: { start: opening.end, end: closing.start } }],
      range: { start, end: closing.end },
      ownedRange: { start, end: closing.end },
      opaque: true,
    };
  }
  const children: MarkupDocumentNode[] = [];
  let cursor = opening.end;
  let childIndex = 0;
  while (cursor < source.text.length) {
    if (source.text.startsWith("<!--", cursor)) {
      const end = source.text.indexOf("-->", cursor + 4);
      if (end < 0) fail(source, "MARKUP_COMMENT", "Unclosed comment.", cursor);
      children.push({ kind: "comment", node: `${path}/c${childIndex++}`, range: { start: cursor, end: end + 3 } });
      cursor = end + 3;
      continue;
    }
    if (source.text.startsWith("</", cursor)) {
      const closing = parseClose(source, cursor);
      if (closing.name !== opening.name) {
        fail(source, "MARKUP_CLOSE_MISMATCH", `<${opening.name}> was closed by </${closing.name}>.`, cursor);
      }
      return {
        kind: "element",
        node: path,
        name: opening.name,
        opening,
        closing: closing.range,
        children: assignOwnedRanges(children, opening.end),
        range: { start, end: closing.range.end },
        ownedRange: { start, end: closing.range.end },
        opaque: false,
      };
    }
    if (source.text[cursor] === "<") {
      const child = parseElement(source, cursor, `${path}/e${childIndex++}`, options);
      children.push(child);
      cursor = child.range.end;
      continue;
    }
    const next = source.text.indexOf("<", cursor);
    const end = next < 0 ? source.text.length : next;
    children.push({ kind: "text", node: `${path}/t${childIndex++}`, range: { start: cursor, end } });
    cursor = end;
  }
  fail(source, "MARKUP_ELEMENT_UNCLOSED", `<${opening.name}> is not closed.`, start);
}

function sameRange(left: SourceRange, right: SourceRange): boolean {
  return left.start === right.start && left.end === right.end;
}

/** Parse one Markup Source without discarding comments, whitespace or spelling. */
export function parseMarkupDocument(source: MarkupSource, options: ParseOptions = {}): MarkupDocument {
  const discovery = discoverMarkup(source);
  const rootStart = discovery.rootStart;
  const root = parseElement(source, rootStart, "root", options);
  if (root.name !== "svml") fail(source, "MARKUP_ROOT", "Document must open with <svml>.", rootStart);
  if (root.closing === undefined) fail(source, "MARKUP_ROOT_UNCLOSED", "Document is missing </svml>.", source.text.length);
  closeDocument(source, root.closing.start);
  const elements = root.children.filter((node): node is MarkupDocumentElement => node.kind === "element");
  const imports = discovery.imports.map((request) => {
    const element = elements.find((candidate) => sameRange(candidate.range, request.range));
    if (element === undefined) fail(source, "MARKUP_IMPORT_DOCUMENT", "Import is missing from the lossless document.", request.range.start);
    return { request, element };
  });
  const importNodes = new Set(imports.map((item) => item.element.node));
  return {
    source,
    root,
    imports,
    declarations: elements.filter((element) => !importNodes.has(element.node)),
  };
}

/** The untouched document always prints byte-for-byte as authored. */
export function printMarkupDocument(document: MarkupDocument): string {
  return document.source.text;
}

type BoundDeclaration = {
  readonly module: ModuleRef;
  readonly declaration: RegisteredMarkupDeclaration;
};

function declarationScope(
  document: MarkupDocument,
  options: Pick<MarkupDocumentFrontendOptions, "resolveModule" | "declarations">,
): Map<string, BoundDeclaration> {
  const scope = new Map<string, BoundDeclaration>();
  const importedModules = new Set<string>();
  for (const item of document.imports) {
    if (item.request.kind !== "module") continue;
    const module = options.resolveModule(item.request);
    const moduleId = moduleKey(module);
    if (importedModules.has(moduleId)) {
      fail(
        document.source,
        "MARKUP_MODULE_IMPORT_DUPLICATE",
        `Module ${moduleId} is imported more than once.`,
        item.request.range.start,
      );
    }
    importedModules.add(moduleId);
    for (const declaration of options.declarations.declarations(module)) {
      const tag = item.request.alias === undefined ? declaration.tag : `${item.request.alias}:${declaration.tag}`;
      const existing = scope.get(tag);
      if (existing !== undefined) {
        fail(
          document.source,
          "MARKUP_DECLARATION_COLLISION",
          `<${tag}> is declared by both ${moduleKey(existing.module)} and ${moduleId}.`,
          item.request.range.start,
        );
      }
      scope.set(tag, { module, declaration });
    }
  }
  return scope;
}

function fieldValue(attribute: MarkupAttributeSyntax): AuthorDeclarationFieldValue {
  return typeof attribute.value === "string"
    ? { kind: "literal", value: attribute.value, range: { ...attribute.valueTokenRange } }
    : { kind: "reference", path: attribute.value.path, range: { ...attribute.valueTokenRange } };
}

function decodeText(source: MarkupSource, range: SourceRange): string {
  return source.text.slice(range.start, range.end).replace(/&(?:lt|gt|amp|quot|apos);/gu, (entity) => {
    switch (entity) {
      case "&lt;": return "<";
      case "&gt;": return ">";
      case "&amp;": return "&";
      case "&quot;": return "\"";
      case "&apos;": return "'";
      default: fail(source, "MARKUP_ENTITY", `Unsupported entity ${entity}.`, range.start);
    }
  });
}

function semanticText(document: MarkupDocument, element: MarkupDocumentElement): string {
  if (element.opaque) {
    if (element.closing === undefined) return "";
    return document.source.text.slice(element.opening.end, element.closing.start);
  }
  return element.children
    .filter((child): child is MarkupDocumentText => child.kind === "text")
    .map((child) => decodeText(document.source, child.range))
    .join("");
}

function structuredContent(
  document: MarkupDocument,
  element: MarkupDocumentElement,
): {
  readonly children: readonly AuthorDeclarationChild[];
  readonly body?: readonly AuthorDeclarationBodyPart[];
  readonly text?: string;
  readonly textRange?: SourceRange;
} {
  const children = element.children
    .filter((child): child is MarkupDocumentElement => child.kind === "element")
    .map((child) => childFromElement(document, child));
  const hasText = element.children.some((child) => child.kind === "text");
  if (children.length > 0 && hasText) {
    let childIndex = 0;
    const body: AuthorDeclarationBodyPart[] = element.children.map((child) => child.kind === "text"
      ? { kind: "text", value: decodeText(document.source, child.range), range: { ...child.range } }
      : { kind: "child", index: childIndex++ });
    return { children, body };
  }
  const text = semanticText(document, element);
  const textNodes = element.children.filter((child): child is MarkupDocumentText => child.kind === "text");
  const textRange = element.opaque && element.closing !== undefined
    ? { start: element.opening.end, end: element.closing.start }
    : textNodes.length === 1 ? { ...textNodes[0]!.range } : undefined;
  return {
    children,
    ...(text.length === 0 ? {} : { text }),
    ...(textRange === undefined ? {} : { textRange }),
  };
}

function childFromElement(document: MarkupDocument, element: MarkupDocumentElement): AuthorDeclarationChild {
  const content = structuredContent(document, element);
  return {
    name: element.name.includes(":") ? element.name.slice(element.name.lastIndexOf(":") + 1) : element.name,
    fields: element.opening.attributeSyntax.map((attribute) => ({ name: attribute.name, value: fieldValue(attribute) })),
    ...content,
    range: { ...element.range },
  };
}

export function declarationsFromMarkupDocument(
  document: MarkupDocument,
  options: Pick<MarkupDocumentFrontendOptions, "resolveModule" | "declarations">,
): readonly import("@hypit/author").AuthorDeclaration[] {
  const scope = declarationScope(document, options);
  return document.declarations.map((element) => {
    const bound = scope.get(element.name);
    if (bound === undefined) fail(document.source, "MARKUP_UNKNOWN_DECLARATION", `No imported module declares <${element.name}>.`, element.range.start);
    const content = structuredContent(document, element);
    return {
      module: bound.module,
      name: bound.declaration.declaration,
      fields: element.opening.attributeSyntax.map((attribute) => ({ name: attribute.name, value: fieldValue(attribute) })),
      ...content,
      range: { ...element.range },
    };
  });
}

export type MarkupDeclarationDecodeOptions = {
  readonly resolveModule: (request: MarkupImportRequest) => ModuleRef;
  readonly syntax: MarkupDeclarationRegistryLike;
  readonly compilers: AuthorDeclarationRegistryLike;
  readonly sourceImports?: readonly ResolvedAuthorSourceImport[];
  readonly resolveAsset?: (request: AuthorSourceAssetRequest) => BlobRef | Promise<BlobRef>;
  readonly readAsset?: (request: AuthorSourceAssetRequest) => Uint8Array | Promise<Uint8Array>;
};

/** Decode one Markup Source through package-owned Author declarations. */
export async function decodeMarkupDeclarations(
  source: MarkupSource,
  options: MarkupDeclarationDecodeOptions,
): Promise<DecodedAuthorSource> {
  const documentOptions = { resolveModule: options.resolveModule, declarations: options.syntax };
  const document = parseMarkupDocument(source, {
    opaqueTags: opaqueTagsForSource(source, documentOptions),
  });
  const declarations = declarationsFromMarkupDocument(document, {
    resolveModule: options.resolveModule,
    declarations: options.syntax,
  });
  const imported = new Map<string, AuthorResolvedReference>();
  const sourceImports = new Map((options.sourceImports ?? []).map((item) => [
    `${item.request.from}\u0000${item.request.alias}`,
    item,
  ]));
  for (const { request } of document.imports) {
    if (request.kind !== "source") continue;
    const item = sourceImports.get(`${request.from}\u0000${request.alias}`);
    if (item === undefined) {
      fail(
        source,
        "MARKUP_SOURCE_IMPORT_UNRESOLVED",
        `Source import "${request.from}" must be decoded before this source.`,
        request.range.start,
      );
    }
    const records = new Map(item.records.map((record) => [record.id, record]));
    for (const value of item.exports) {
      const path = `${request.alias}.${value.name}`;
      if (imported.has(path)) {
        fail(source, "MARKUP_SOURCE_EXPORT_COLLISION", `Imported binding ${path} is duplicated.`, request.range.start);
      }
      const record = value.ref.kind === "record" ? records.get(value.ref.id) : undefined;
      imported.set(path, {
        path,
        ref: value.ref,
        type: value.type,
        ...(record === undefined ? {} : { record }),
      });
    }
  }
  return await compileAuthorDeclarations({
    sourceName: source.name,
    ...(source.id === undefined ? {} : { sourceId: source.id }),
    declarations,
    registry: options.compilers,
    resolveReference: (path) => imported.get(path),
    resolveAsset: async (request) => {
      if (options.resolveAsset === undefined) {
        fail(source, "MARKUP_ASSET_RESOLVER_MISSING", `Declaration requested ${request.from}, but this Markup Host has no asset resolver.`, request.range?.start);
      }
      return await options.resolveAsset(request);
    },
    readAsset: async (request) => {
      if (options.readAsset === undefined) {
        fail(source, "MARKUP_ASSET_READER_MISSING", `Declaration requested readable input ${request.from}, but this Markup Host has no asset reader.`, request.range?.start);
      }
      return await options.readAsset(request);
    },
  });
}

export type MarkupDeclarationAuthorFrontendOptions = {
  readonly resolveModule: (request: MarkupImportRequest) => ModuleRef;
  readonly syntax: MarkupDeclarationRegistryLike;
  readonly compilers: AuthorDeclarationRegistryLike;
};

export const markupDeclarationAuthorFrontendId = "@hypit/markup@1";

/** Complete Markup Frontend backed by declaration syntax and compilers. */
export function createMarkupDeclarationAuthorFrontend(
  options: MarkupDeclarationAuthorFrontendOptions,
): AuthorFrontend {
  return {
    id: markupDeclarationAuthorFrontendId,
    document: createMarkupDocumentFrontend({
      resolveModule: options.resolveModule,
      declarations: options.syntax,
    }),
    discover(source) {
      const discovery = discoverMarkup({ ...source, text: decodeSourceText(source) });
      return {
        modules: discovery.imports.filter((item) => item.kind === "module").map((item) => item.from),
        sources: discovery.imports
          .filter((item): item is MarkupImportRequest & { alias: string; kind: "source" } =>
            item.kind === "source" && item.alias !== undefined)
          .map((item) => ({ from: item.from, alias: item.alias, range: item.range })),
      };
    },
    async decode(source, context) {
      return await decodeMarkupDeclarations({
        id: source.id,
        name: source.name,
        text: decodeSourceText(source),
      }, {
        resolveModule: options.resolveModule,
        syntax: options.syntax,
        compilers: options.compilers,
        sourceImports: context.imports,
        resolveAsset: context.resolveAsset,
        ...(context.readAsset === undefined ? {} : { readAsset: context.readAsset }),
      });
    },
  };
}

function opaqueTagsForSource(
  source: MarkupSource,
  options: MarkupDocumentFrontendOptions,
): ReadonlySet<string> {
  const discovery = discoverMarkup(source);
  const result = new Set<string>();
  for (const request of discovery.imports) {
    if (request.kind !== "module") continue;
    const module = options.resolveModule(request);
    for (const declaration of options.declarations.declarations(module)) {
      if (declaration.body !== "opaque") continue;
      result.add(request.alias === undefined ? declaration.tag : `${request.alias}:${declaration.tag}`);
    }
  }
  return result;
}

function projectDocument(
  source: SourceUnit,
  document: MarkupDocument,
  options: MarkupDocumentFrontendOptions,
): AuthorDocument {
  const declarationsByTag = declarationScope(document, options);
  const declarations: AuthorDocumentDeclaration[] = document.declarations.flatMap((element) => {
    const declaration = declarationsByTag.get(element.name);
    if (declaration === undefined) return [];
    const opaque = declaration.declaration.body === "opaque";
    const structured = !opaque;
    const opaqueText = structured ? undefined : semanticText(document, element);
    const content = structured
      ? structuredContent(document, element)
      : { children: [] as readonly AuthorDeclarationChild[],
          ...(opaqueText === undefined || opaqueText.length === 0 ? {} : { text: opaqueText }) };
    return [{
      node: element.node,
      container: document.root.node,
      module: declaration.module,
      name: declaration.declaration.declaration,
      fields: element.opening.attributeSyntax.map((attribute) => ({
        name: attribute.name,
        value: fieldValue(attribute),
      })),
      ...content,
      range: { ...element.range },
    }];
  });
  return {
    source,
    imports: document.imports.map((item) => requestImport(item.request)),
    root: { node: document.root.node, declarations: declarations.map((item) => item.node) },
    containers: [{ node: document.root.node, declarations: declarations.map((item) => item.node) }],
    declarations,
    representation: document,
  };
}

function escapeLiteral(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function serializeValue(value: AuthorDeclarationFieldValue): string {
  return value.kind === "reference" ? `{${value.path}}` : `"${escapeLiteral(value.value)}"`;
}

function serializeChild(child: AuthorDeclarationChild, indent: string): string {
  const fields = child.fields.map((field) => ` ${field.name}=${serializeValue(field.value)}`).join("");
  if (child.children.length === 0 && child.text === undefined && child.body === undefined) return `<${child.name}${fields}/>`;
  if (child.body !== undefined) {
    const body = child.body.map((part) => part.kind === "text"
      ? escapeLiteral(part.value)
      : serializeChild(child.children[part.index]!, indent)).join("");
    return `<${child.name}${fields}>${body}</${child.name}>`;
  }
  const nested = child.children.map((item) => `\n${indent}  ${serializeChild(item, `${indent}  `)}`).join("");
  const text = child.text === undefined ? "" : escapeLiteral(child.text);
  const closeIndent = child.children.length === 0 ? "" : `\n${indent}`;
  return `<${child.name}${fields}>${text}${nested}${closeIndent}</${child.name}>`;
}

function sameImport(left: AuthorDocumentImport, right: AuthorDocumentImport): boolean {
  return left.kind === right.kind && left.from === right.from && left.alias === right.alias;
}

function requestImport(request: MarkupImportRequest): AuthorDocumentImport {
  return { kind: request.kind, from: request.from, ...(request.alias === undefined ? {} : { alias: request.alias }) };
}

function spellingForDeclaration(
  declaration: AuthorDeclarationDraft,
  imports: readonly AuthorDocumentImport[],
  options: MarkupDocumentFrontendOptions,
): { readonly tag: string; readonly body: "structured" | "opaque" } {
  for (const value of imports) {
    if (value.kind !== "module") continue;
    const request: MarkupImportRequest = {
      kind: "module",
      from: value.from,
      ...(value.alias === undefined ? {} : { alias: value.alias }),
      range: { start: 0, end: 0 },
    };
    const module = options.resolveModule(request);
    if (moduleKey(module) !== moduleKey(declaration.module)) continue;
    const syntax = options.declarations.resolve(module, declaration.name);
    if (syntax !== undefined) return {
      tag: value.alias === undefined ? syntax.tag : `${value.alias}:${syntax.tag}`,
      body: syntax.body === "opaque" ? "opaque" : "structured",
    };
    break;
  }
  throw new Error(`No Markup import spells ${moduleKey(declaration.module)}#${declaration.name}.`);
}

function serializeDeclaration(
  declaration: AuthorDeclarationDraft,
  imports: readonly AuthorDocumentImport[],
  options: MarkupDocumentFrontendOptions,
  indent: string,
): string {
  const spelling = spellingForDeclaration(declaration, imports, options);
  const tag = spelling.tag;
  const fields = declaration.fields.map((field) => ` ${field.name}=${serializeValue(field.value)}`).join("");
  if (spelling.body === "structured" && declaration.children.length === 0 && declaration.text === undefined && declaration.body === undefined) {
    return `<${tag}${fields}/>`;
  }
  if (spelling.body === "structured" && declaration.body !== undefined) {
    const body = declaration.body.map((part) => part.kind === "text"
      ? escapeLiteral(part.value)
      : serializeChild(declaration.children[part.index]!, indent)).join("");
    return `<${tag}${fields}>${body}</${tag}>`;
  }
  const children = declaration.children.map((child) => `\n${indent}  ${serializeChild(child, `${indent}  `)}`).join("");
  const text = declaration.text === undefined
    ? ""
    : spelling.body === "opaque" ? declaration.text : escapeLiteral(declaration.text);
  const closeIndent = declaration.children.length === 0 ? "" : `\n${indent}`;
  return `<${tag}${fields}>${text}${children}${closeIndent}</${tag}>`;
}

function rootIndent(document: MarkupDocument): string {
  const declaration = document.declarations[0] ?? document.imports[0]?.element;
  if (declaration === undefined) return "  ";
  const before = document.source.text.slice(declaration.ownedRange.start, declaration.range.start);
  const line = before.slice(before.lastIndexOf("\n") + 1);
  return /^[\t ]*$/u.test(line) ? line : "  ";
}

type TextEdit = { readonly start: number; readonly end: number; readonly text: string; readonly rank?: number };

function applyTextEdits(source: string, edits: readonly TextEdit[]): string {
  const combined: TextEdit[] = [];
  const insertions = new Map<number, TextEdit[]>();
  for (const edit of edits) {
    if (edit.start !== edit.end) {
      combined.push(edit);
      continue;
    }
    const values = insertions.get(edit.start) ?? [];
    values.push(edit);
    insertions.set(edit.start, values);
  }
  for (const [offset, values] of insertions) {
    combined.push({
      start: offset,
      end: offset,
      text: values
        .map((value, index) => ({ value, index }))
        .sort((left, right) => (left.value.rank ?? 1) - (right.value.rank ?? 1) || left.index - right.index)
        .map(({ value }) => value.text)
        .join(""),
    });
  }
  const ordered = combined.sort((left, right) => right.start - left.start || right.end - left.end);
  let boundary = source.length;
  let result = source;
  for (const edit of ordered) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > source.length || edit.end > boundary) {
      throw new Error("Document operations overlap or address an invalid range.");
    }
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`;
    boundary = edit.start;
  }
  return result;
}

function importText(value: AuthorDocumentImport): string {
  const kind = value.kind === "module" ? "from" : "source";
  return `<import ${kind}="${escapeLiteral(value.from)}"${value.alias === undefined ? "" : ` as="${escapeLiteral(value.alias)}"`}/>`;
}

/** Apply one revision-scoped batch of neutral operations to a lossless Markup document. */
export function applyMarkupDocumentOperations(
  document: MarkupDocument,
  operations: readonly AuthorDocumentOperation[],
  options: MarkupDocumentFrontendOptions,
): string {
  const elements = new Map(document.declarations.map((element) => [element.node, element]));
  const currentImports = document.imports.map((item) => requestImport(item.request));
  const effectiveImports = [...currentImports];
  for (const operation of operations) {
    if (operation.kind === "add-import" && !effectiveImports.some((item) => sameImport(item, operation.value))) {
      effectiveImports.push(operation.value);
    }
    if (operation.kind === "remove-import") {
      const index = effectiveImports.findIndex((item) => sameImport(item, operation.value));
      if (index >= 0) effectiveImports.splice(index, 1);
    }
  }
  const edits: TextEdit[] = [];
  const indent = rootIndent(document);
  for (const operation of operations) {
    if (operation.kind === "add-field") {
      const element = elements.get(operation.declaration);
      if (element === undefined) throw new Error(`Unknown declaration ${operation.declaration}.`);
      const attribute = element.opening.attributeSyntax.find((item) => item.name === operation.name);
      if (attribute !== undefined) {
        throw new Error(`Declaration ${operation.declaration} already has field ${operation.name}.`);
      }
      const suffix = element.opening.selfClosing ? 2 : 1;
      const offset = element.opening.end - suffix;
      edits.push({ start: offset, end: offset, text: ` ${operation.name}=${serializeValue(operation.value)}` });
      continue;
    }
    if (operation.kind === "replace-field") {
      const element = elements.get(operation.declaration);
      if (element === undefined) throw new Error(`Unknown declaration ${operation.declaration}.`);
      const attribute = element.opening.attributeSyntax.find((item) => item.name === operation.name);
      if (attribute === undefined) {
        throw new Error(`Declaration ${operation.declaration} has no field ${operation.name}.`);
      }
      edits.push({ start: attribute.valueTokenRange.start, end: attribute.valueTokenRange.end, text: serializeValue(operation.value) });
      continue;
    }
    if (operation.kind === "remove-field") {
      const element = elements.get(operation.declaration);
      if (element === undefined) throw new Error(`Unknown declaration ${operation.declaration}.`);
      const attribute = element.opening.attributeSyntax.find((item) => item.name === operation.name);
      if (attribute === undefined) throw new Error(`Declaration ${operation.declaration} has no field ${operation.name}.`);
      edits.push({ start: attribute.range.start, end: attribute.range.end, text: "" });
      continue;
    }
    if (operation.kind === "replace-text") {
      const element = elements.get(operation.declaration);
      if (element === undefined) throw new Error(`Unknown declaration ${operation.declaration}.`);
      if (element.opening.selfClosing || element.closing === undefined) {
        throw new Error(`Declaration ${operation.declaration} does not expose body text.`);
      }
      const textNodes = element.children.filter((node): node is MarkupDocumentText => node.kind === "text");
      if (textNodes.length === 0) {
        edits.push({
          start: element.closing.start,
          end: element.closing.start,
          text: element.opaque ? operation.value : escapeLiteral(operation.value),
        });
      } else {
        for (const [index, node] of textNodes.entries()) {
          edits.push({
            start: node.range.start,
            end: node.range.end,
            text: index === 0 ? (element.opaque ? operation.value : escapeLiteral(operation.value)) : "",
          });
        }
      }
      continue;
    }
    if (operation.kind === "delete-declaration") {
      const element = elements.get(operation.declaration);
      if (element === undefined) throw new Error(`Unknown declaration ${operation.declaration}.`);
      edits.push({ start: element.ownedRange.start, end: element.ownedRange.end, text: "" });
      continue;
    }
    if (operation.kind === "move-declaration") {
      if (operation.container !== document.root.node) throw new Error(`Unknown container ${operation.container}.`);
      const element = elements.get(operation.declaration);
      if (element === undefined) throw new Error(`Unknown declaration ${operation.declaration}.`);
      const before = operation.before === undefined ? undefined : elements.get(operation.before);
      if (operation.before !== undefined && before === undefined) throw new Error(`Unknown declaration ${operation.before}.`);
      const text = document.source.text.slice(element.ownedRange.start, element.ownedRange.end);
      const offset = before?.ownedRange.start ?? document.root.closing!.start;
      edits.push({ start: element.ownedRange.start, end: element.ownedRange.end, text: "" });
      edits.push({ start: offset, end: offset, text });
      continue;
    }
    if (operation.kind === "insert-declaration") {
      if (operation.container !== document.root.node) throw new Error(`Unknown container ${operation.container}.`);
      const before = operation.before === undefined ? undefined : elements.get(operation.before);
      if (operation.before !== undefined && before === undefined) throw new Error(`Unknown declaration ${operation.before}.`);
      const offset = before?.ownedRange.start ?? document.root.closing!.start;
      const declaration = serializeDeclaration(operation.declaration, effectiveImports, options, indent);
      edits.push({ start: offset, end: offset, text: `\n${indent}${declaration}`, rank: 1 });
      continue;
    }
    if (operation.kind === "add-import") {
      if (currentImports.some((item) => sameImport(item, operation.value))) continue;
      const firstDeclaration = document.declarations[0];
      const offset = firstDeclaration?.ownedRange.start ?? document.root.closing!.start;
      edits.push({ start: offset, end: offset, text: `\n${indent}${importText(operation.value)}`, rank: 0 });
      continue;
    }
    const item = document.imports.find((candidate) => sameImport(requestImport(candidate.request), operation.value));
    if (item === undefined) throw new Error(`Unknown import ${operation.value.from}.`);
    edits.push({ start: item.element.ownedRange.start, end: item.element.ownedRange.end, text: "" });
  }
  return applyTextEdits(document.source.text, edits);
}

/** Create the editable side of the Markup Frontend without changing compilation. */
export function createMarkupDocumentFrontend(options: MarkupDocumentFrontendOptions): AuthorDocumentFrontend {
  return {
    async openDocument(source) {
      const markupSource = { id: source.id, name: source.name, text: decodeSourceText(source) };
      const document = parseMarkupDocument(markupSource, { opaqueTags: opaqueTagsForSource(markupSource, options) });
      return projectDocument(source, document, options);
    },
    async applyDocumentOperations(document, operations) {
      const representation = document.representation as MarkupDocument;
      if (representation.source.id !== undefined && representation.source.id !== document.source.id) {
        throw new Error("Author Document belongs to a different Source.");
      }
      const text = applyMarkupDocumentOperations(representation, operations, options);
      return { ...document.source, bytes: new TextEncoder().encode(text) };
    },
  };
}
