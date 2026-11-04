import type {
  AuthorDocument,
  AuthorDocumentOperation,
  AuthorFrontend,
} from "@hypit/hypit/author";
import { decodeSourceText } from "@hypit/hypit/source";

import { parseDocument, serializeDocumentBlock } from "./markdown.js";

export const documentFrontendId = "@hypit/document@1";
const rootNode = "document:root";

type DocumentRepresentation = {
  readonly source: string;
  readonly blocks: ReturnType<typeof parseDocument>["blocks"];
};

type TextEdit = { readonly start: number; readonly end: number; readonly text: string; readonly rank?: number };

function applyTextEdits(source: string, edits: readonly TextEdit[]): string {
  const insertions = new Map<number, TextEdit[]>();
  const combined: TextEdit[] = [];
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
      throw new Error("Document block operations overlap or address an invalid range.");
    }
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`;
    boundary = edit.start;
  }
  return result;
}

function separationBefore(source: string, offset: number): string {
  if (offset === 0 || /(?:\r?\n){2}$/u.test(source.slice(0, offset))) return "";
  return source[offset - 1] === "\n" ? "\n" : "\n\n";
}

function separationAfter(source: string, offset: number): string {
  if (offset >= source.length || /^(?:\r?\n){2}/u.test(source.slice(offset))) return "";
  return source[offset] === "\n" ? "\n" : "\n\n";
}

function ownedBlockEnd(representation: DocumentRepresentation, block: DocumentRepresentation["blocks"][number]): number {
  const next = representation.blocks.find((candidate) => candidate.range.start > block.range.start);
  return next?.range.start ?? representation.source.length;
}

function insertionText(source: string, offset: number, markdown: string, before: boolean): string {
  if (before) return `${markdown}${separationAfter(source, offset)}`;
  const terminalNewline = source.endsWith("\n") ? "\n" : "";
  return `${separationBefore(source, offset)}${markdown}${terminalNewline}`;
}

function project(source: import("@hypit/hypit/source").SourceUnit): AuthorDocument {
  const parsed = parseDocument(decodeSourceText(source));
  return {
    source,
    imports: [],
    root: { node: rootNode, blocks: parsed.blocks, declarations: [] },
    containers: [{ node: rootNode, blocks: parsed.blocks, declarations: [] }],
    declarations: [],
    representation: { source: parsed.source, blocks: parsed.blocks } satisfies DocumentRepresentation,
  };
}

function blockEdits(
  representation: DocumentRepresentation,
  operations: readonly AuthorDocumentOperation[],
): readonly TextEdit[] {
  const blocks = new Map(representation.blocks.map((block) => [block.node, block]));
  const edits: TextEdit[] = [];
  for (const operation of operations) {
    if (operation.kind === "insert-block") {
      if (operation.container !== rootNode) throw new Error(`Unknown document block container ${operation.container}.`);
      const before = operation.before === undefined ? undefined : blocks.get(operation.before);
      if (operation.before !== undefined && before === undefined) throw new Error(`Unknown document block ${operation.before}.`);
      const offset = before?.range.start ?? representation.source.length;
      const markdown = serializeDocumentBlock(operation.block);
      edits.push({
        start: offset,
        end: offset,
        text: insertionText(representation.source, offset, markdown, before !== undefined),
      });
      continue;
    }
    if (operation.kind === "replace-block") {
      const current = blocks.get(operation.block);
      if (current === undefined) throw new Error(`Unknown document block ${operation.block}.`);
      edits.push({ start: current.range.start, end: current.range.end, text: serializeDocumentBlock(operation.value) });
      continue;
    }
    if (operation.kind === "delete-block") {
      const current = blocks.get(operation.block);
      if (current === undefined) throw new Error(`Unknown document block ${operation.block}.`);
      edits.push({ start: current.range.start, end: ownedBlockEnd(representation, current), text: "" });
      continue;
    }
    if (operation.kind === "move-block") {
      if (operation.container !== rootNode) throw new Error(`Unknown document block container ${operation.container}.`);
      const current = blocks.get(operation.block);
      if (current === undefined) throw new Error(`Unknown document block ${operation.block}.`);
      const before = operation.before === undefined ? undefined : blocks.get(operation.before);
      if (operation.before !== undefined && before === undefined) throw new Error(`Unknown document block ${operation.before}.`);
      if (before?.node === current.node) throw new Error("Document block cannot move before itself.");
      const currentIndex = representation.blocks.findIndex((block) => block.node === current.node);
      const beforeIndex = before === undefined
        ? representation.blocks.length
        : representation.blocks.findIndex((block) => block.node === before.node);
      if (beforeIndex === currentIndex + 1 || (before === undefined && currentIndex === representation.blocks.length - 1)) {
        continue;
      }
      const offset = before?.range.start ?? representation.source.length;
      const markdown = representation.source.slice(current.range.start, current.range.end);
      edits.push({ start: current.range.start, end: ownedBlockEnd(representation, current), text: "" });
      edits.push({
        start: offset,
        end: offset,
        text: insertionText(representation.source, offset, markdown, before !== undefined),
      });
      continue;
    }
    throw new Error(`The Markdown Document Frontend does not accept ${operation.kind} operations.`);
  }
  return edits;
}

export const documentFrontend: AuthorFrontend = {
  id: documentFrontendId,
  document: {
    async openDocument(source) {
      return project(source);
    },
    async applyDocumentOperations(document, operations) {
      const representation = document.representation as DocumentRepresentation;
      const text = applyTextEdits(representation.source, blockEdits(representation, operations));
      return { ...document.source, bytes: new TextEncoder().encode(text) };
    },
  },
  discover() {
    return { modules: [], sources: [] };
  },
  decode() {
    return { records: [], components: [], exports: [] };
  },
};
