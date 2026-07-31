import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fail, sourceLocation } from "../diagnostics.js";
import type {
  AttributeValue,
  SourceDocument,
  SourceElement,
  SourceNode,
} from "../model.js";

type Cursor = {
  file: string;
  source: string;
  offset: number;
};

const NAME = /[A-Za-z_][A-Za-z0-9_.:-]*/y;

function skipSpace(cursor: Cursor): void {
  while (/\s/u.test(cursor.source[cursor.offset] ?? "")) cursor.offset += 1;
}

function parseName(cursor: Cursor): string {
  NAME.lastIndex = cursor.offset;
  const match = NAME.exec(cursor.source);
  if (!match) {
    fail(
      "source_expected_name",
      "Expected an element or attribute name.",
      sourceLocation(cursor.file, cursor.source, cursor.offset),
    );
  }
  cursor.offset = NAME.lastIndex;
  return match[0];
}

function parseQuoted(cursor: Cursor): string {
  const quote = cursor.source[cursor.offset];
  if (quote !== '"' && quote !== "'") {
    fail(
      "source_expected_quoted_value",
      "Attribute literals must be quoted.",
      sourceLocation(cursor.file, cursor.source, cursor.offset),
    );
  }
  const start = ++cursor.offset;
  while (cursor.offset < cursor.source.length && cursor.source[cursor.offset] !== quote) {
    cursor.offset += 1;
  }
  if (cursor.source[cursor.offset] !== quote) {
    fail(
      "source_unclosed_attribute",
      "Unclosed quoted attribute value.",
      sourceLocation(cursor.file, cursor.source, start - 1),
    );
  }
  const value = cursor.source.slice(start, cursor.offset);
  cursor.offset += 1;
  return value;
}

function parseReference(cursor: Cursor): AttributeValue {
  const start = ++cursor.offset;
  while (cursor.offset < cursor.source.length && cursor.source[cursor.offset] !== "}") {
    cursor.offset += 1;
  }
  if (cursor.source[cursor.offset] !== "}") {
    fail(
      "source_unclosed_reference",
      "Unclosed reference attribute.",
      sourceLocation(cursor.file, cursor.source, start - 1),
    );
  }
  const path = cursor.source.slice(start, cursor.offset).trim();
  cursor.offset += 1;
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(path)) {
    fail(
      "source_invalid_reference",
      `Invalid reference path "${path}".`,
      sourceLocation(cursor.file, cursor.source, start),
    );
  }
  return { kind: "reference", path };
}

function literalValue(raw: string): AttributeValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?(?:\d+\.?\d*|\.\d+)$/u.test(raw)) return Number(raw);
  return raw;
}

function parseAttributes(cursor: Cursor): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {};
  while (cursor.offset < cursor.source.length) {
    skipSpace(cursor);
    const next = cursor.source[cursor.offset];
    if (next === ">" || (next === "/" && cursor.source[cursor.offset + 1] === ">")) break;
    const name = parseName(cursor);
    if (Object.hasOwn(attributes, name)) {
      fail(
        "source_duplicate_attribute",
        `Duplicate attribute "${name}".`,
        sourceLocation(cursor.file, cursor.source, cursor.offset),
      );
    }
    skipSpace(cursor);
    if (cursor.source[cursor.offset] !== "=") {
      fail(
        "source_expected_attribute_equals",
        `Attribute "${name}" requires "=".`,
        sourceLocation(cursor.file, cursor.source, cursor.offset),
      );
    }
    cursor.offset += 1;
    skipSpace(cursor);
    const value = cursor.source[cursor.offset] === "{"
      ? parseReference(cursor)
      : literalValue(parseQuoted(cursor));
    attributes[name] = value;
  }
  return attributes;
}

function skipComment(cursor: Cursor): boolean {
  if (!cursor.source.startsWith("<!--", cursor.offset)) return false;
  const end = cursor.source.indexOf("-->", cursor.offset + 4);
  if (end < 0) {
    fail(
      "source_unclosed_comment",
      "Unclosed source comment.",
      sourceLocation(cursor.file, cursor.source, cursor.offset),
    );
  }
  cursor.offset = end + 3;
  return true;
}

function parseElement(cursor: Cursor): SourceElement {
  const start = cursor.offset;
  if (cursor.source[cursor.offset] !== "<" || cursor.source[cursor.offset + 1] === "/") {
    fail(
      "source_expected_element",
      "Expected an opening element.",
      sourceLocation(cursor.file, cursor.source, cursor.offset),
    );
  }
  cursor.offset += 1;
  const name = parseName(cursor);
  const attributes = parseAttributes(cursor);
  skipSpace(cursor);
  if (cursor.source.startsWith("/>", cursor.offset)) {
    cursor.offset += 2;
    return { kind: "element", name, attributes, children: [], start, end: cursor.offset };
  }
  if (cursor.source[cursor.offset] !== ">") {
    fail(
      "source_expected_tag_end",
      `Opening <${name}> is not closed.`,
      sourceLocation(cursor.file, cursor.source, cursor.offset),
    );
  }
  cursor.offset += 1;

  const children: SourceNode[] = [];
  if (name === "script") {
    const close = cursor.source.indexOf("</script>", cursor.offset);
    if (close < 0) {
      fail(
        "source_unclosed_script",
        "The <script> element is not closed.",
        sourceLocation(cursor.file, cursor.source, start),
      );
    }
    children.push({
      kind: "text",
      value: cursor.source.slice(cursor.offset, close),
      start: cursor.offset,
      end: close,
    });
    cursor.offset = close + "</script>".length;
    return { kind: "element", name, attributes, children, start, end: cursor.offset };
  }

  while (cursor.offset < cursor.source.length) {
    if (skipComment(cursor)) continue;
    if (cursor.source.startsWith("</", cursor.offset)) {
      cursor.offset += 2;
      const closeName = parseName(cursor);
      skipSpace(cursor);
      if (cursor.source[cursor.offset] !== ">") {
        fail(
          "source_expected_tag_end",
          `Closing </${closeName}> is not closed.`,
          sourceLocation(cursor.file, cursor.source, cursor.offset),
        );
      }
      cursor.offset += 1;
      if (closeName !== name) {
        fail(
          "source_mismatched_close",
          `Expected </${name}>, received </${closeName}>.`,
          sourceLocation(cursor.file, cursor.source, cursor.offset),
        );
      }
      return { kind: "element", name, attributes, children, start, end: cursor.offset };
    }
    if (cursor.source[cursor.offset] === "<") {
      children.push(parseElement(cursor));
      continue;
    }
    const textStart = cursor.offset;
    const next = cursor.source.indexOf("<", cursor.offset);
    cursor.offset = next < 0 ? cursor.source.length : next;
    children.push({
      kind: "text",
      value: cursor.source.slice(textStart, cursor.offset),
      start: textStart,
      end: cursor.offset,
    });
  }
  fail(
    "source_unclosed_element",
    `The <${name}> element is not closed.`,
    sourceLocation(cursor.file, cursor.source, start),
  );
}

export function parseRootSource(file: string, source: string): SourceElement {
  const cursor: Cursor = { file, source, offset: 0 };
  skipSpace(cursor);
  while (skipComment(cursor)) skipSpace(cursor);
  const root = parseElement(cursor);
  skipSpace(cursor);
  while (skipComment(cursor)) skipSpace(cursor);
  if (cursor.offset !== source.length) {
    fail(
      "source_trailing_content",
      "Only comments and whitespace may follow the root element.",
      sourceLocation(file, source, cursor.offset),
    );
  }
  return root;
}

export function parseDocumentSource(file: string, source: string): SourceDocument {
  source = source.replace(/\r\n?/gu, "\n").normalize("NFC");
  const root = parseRootSource(file, source);
  if (root.name !== "svml") {
    fail(
      "source_invalid_root",
      `Expected <svml>, received <${root.name}>.`,
      sourceLocation(file, source, root.start),
    );
  }
  const scripts = root.children.filter(
    (node): node is SourceElement => node.kind === "element" && node.name === "script",
  );
  if (scripts.length !== 1) {
    fail(
      "source_script_cardinality",
      `Expected exactly one <script>, received ${scripts.length}.`,
      sourceLocation(file, source, root.start),
    );
  }
  const scriptText = scripts[0]?.children[0];
  if (!scriptText || scriptText.kind !== "text") {
    fail("source_script_missing_text", "The <script> body could not be read.");
  }
  return {
    file,
    source,
    root,
    scriptSource: scriptText.value,
    scriptOffset: scriptText.start,
  };
}

export async function parseDocument(file: string): Promise<SourceDocument> {
  const absolute = resolve(file);
  return parseDocumentSource(absolute, await readFile(absolute, "utf8"));
}
