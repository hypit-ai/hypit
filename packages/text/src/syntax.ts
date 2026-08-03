import type { SourceRange } from "@svml/protocol";

import { TextFrontendError } from "./error.js";
import type {
  SourceUnit,
  StructuredElement,
  StructuredNode,
  TextAttributeValue,
  TextDiscovery,
  TextImportRequest,
} from "./types.js";

const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/u;
const ALIAS = /^[a-z][a-z0-9_-]{0,63}$/u;
const REFERENCE = /^[A-Za-z_][A-Za-z0-9_.:-]*(?:\.[A-Za-z_][A-Za-z0-9_.:-]*)*$/u;

type OpeningTag = {
  readonly name: string;
  readonly attributes: Readonly<Record<string, TextAttributeValue>>;
  readonly start: number;
  readonly end: number;
  readonly selfClosing: boolean;
};

function fail(source: SourceUnit, code: string, message: string, offset?: number): never {
  throw new TextFrontendError(code, message, source.name, offset);
}

function decodeEntities(value: string, source: SourceUnit, offset: number): string {
  return value.replace(/&(?:lt|gt|amp|quot|apos);/gu, (entity) => {
    switch (entity) {
      case "&lt;": return "<";
      case "&gt;": return ">";
      case "&amp;": return "&";
      case "&quot;": return "\"";
      case "&apos;": return "'";
      default: fail(source, "TEXT_ENTITY", `Unsupported entity ${entity}.`, offset);
    }
  });
}

function skipSpace(text: string, start: number): number {
  let cursor = start;
  while (/\s/u.test(text[cursor] ?? "")) cursor += 1;
  return cursor;
}

function skipTrivia(source: SourceUnit, start: number): number {
  let cursor = start;
  while (cursor < source.text.length) {
    const next = skipSpace(source.text, cursor);
    if (source.text.startsWith("<!--", next)) {
      const end = source.text.indexOf("-->", next + 4);
      if (end < 0) fail(source, "TEXT_COMMENT", "Unclosed comment.", next);
      cursor = end + 3;
      continue;
    }
    return next;
  }
  return cursor;
}

function parseName(source: SourceUnit, start: number): { readonly value: string; readonly end: number } {
  const match = NAME.exec(source.text.slice(start));
  if (!match) fail(source, "TEXT_NAME", "Expected a name.", start);
  return { value: match[0], end: start + match[0].length };
}

function parseAttributeValue(
  source: SourceUnit,
  start: number,
): { readonly value: TextAttributeValue; readonly end: number } {
  const quote = source.text[start];
  if (quote === "\"" || quote === "'") {
    const close = source.text.indexOf(quote, start + 1);
    if (close < 0) fail(source, "TEXT_ATTRIBUTE", "Unclosed quoted attribute.", start);
    return {
      value: decodeEntities(source.text.slice(start + 1, close), source, start),
      end: close + 1,
    };
  }
  if (quote === "{") {
    const close = source.text.indexOf("}", start + 1);
    if (close < 0) fail(source, "TEXT_REFERENCE", "Unclosed reference attribute.", start);
    const path = source.text.slice(start + 1, close).trim();
    if (!REFERENCE.test(path)) fail(source, "TEXT_REFERENCE", `Invalid reference "${path}".`, start);
    return { value: { kind: "reference", path }, end: close + 1 };
  }
  fail(source, "TEXT_ATTRIBUTE", "Attribute values must be quoted strings or whole-value references.", start);
}

export function parseOpeningTag(source: SourceUnit, start: number): OpeningTag {
  if (source.text[start] !== "<" || source.text[start + 1] === "/") {
    fail(source, "TEXT_OPEN", "Expected an opening tag.", start);
  }
  const parsedName = parseName(source, start + 1);
  let cursor = parsedName.end;
  const attributes: Record<string, TextAttributeValue> = {};
  while (cursor < source.text.length) {
    cursor = skipSpace(source.text, cursor);
    if (source.text.startsWith("/>", cursor)) {
      return { name: parsedName.value, attributes, start, end: cursor + 2, selfClosing: true };
    }
    if (source.text[cursor] === ">") {
      return { name: parsedName.value, attributes, start, end: cursor + 1, selfClosing: false };
    }
    const attribute = parseName(source, cursor);
    if (Object.hasOwn(attributes, attribute.value)) {
      fail(source, "TEXT_ATTRIBUTE_DUPLICATE", `Duplicate attribute "${attribute.value}".`, cursor);
    }
    cursor = skipSpace(source.text, attribute.end);
    if (source.text[cursor] !== "=") fail(source, "TEXT_ATTRIBUTE", `Attribute "${attribute.value}" requires =.`, cursor);
    cursor = skipSpace(source.text, cursor + 1);
    const value = parseAttributeValue(source, cursor);
    Object.defineProperty(attributes, attribute.value, {
      value: value.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    cursor = value.end;
  }
  fail(source, "TEXT_OPEN", `Opening tag <${parsedName.value}> is not closed.`, start);
}

function parseClose(source: SourceUnit, start: number): { readonly name: string; readonly end: number } {
  if (!source.text.startsWith("</", start)) fail(source, "TEXT_CLOSE", "Expected a closing tag.", start);
  const name = parseName(source, start + 2);
  const cursor = skipSpace(source.text, name.end);
  if (source.text[cursor] !== ">") fail(source, "TEXT_CLOSE", "Malformed closing tag.", start);
  return { name: name.value, end: cursor + 1 };
}

export function parseStructuredElement(
  source: SourceUnit,
  start: number,
): { readonly element: StructuredElement; readonly nextOffset: number } {
  const opening = parseOpeningTag(source, start);
  if (opening.selfClosing) {
    return {
      element: {
        kind: "element",
        name: opening.name,
        attributes: opening.attributes,
        children: [],
        range: { start, end: opening.end },
      },
      nextOffset: opening.end,
    };
  }
  const children: StructuredNode[] = [];
  let cursor = opening.end;
  while (cursor < source.text.length) {
    if (source.text.startsWith("<!--", cursor)) {
      const end = source.text.indexOf("-->", cursor + 4);
      if (end < 0) fail(source, "TEXT_COMMENT", "Unclosed comment.", cursor);
      cursor = end + 3;
      continue;
    }
    if (source.text.startsWith("</", cursor)) {
      const close = parseClose(source, cursor);
      if (close.name !== opening.name) {
        fail(source, "TEXT_CLOSE_MISMATCH", `<${opening.name}> was closed by </${close.name}>.`, cursor);
      }
      return {
        element: {
          kind: "element",
          name: opening.name,
          attributes: opening.attributes,
          children,
          range: { start, end: close.end },
        },
        nextOffset: close.end,
      };
    }
    if (source.text[cursor] === "<") {
      const child = parseStructuredElement(source, cursor);
      children.push(child.element);
      cursor = child.nextOffset;
      continue;
    }
    const next = source.text.indexOf("<", cursor);
    const end = next < 0 ? source.text.length : next;
    children.push({
      kind: "text",
      value: decodeEntities(source.text.slice(cursor, end), source, cursor),
      range: { start: cursor, end },
    });
    cursor = end;
  }
  fail(source, "TEXT_ELEMENT_UNCLOSED", `<${opening.name}> is not closed.`, start);
}

function stringAttribute(
  source: SourceUnit,
  opening: OpeningTag,
  name: string,
  required = false,
): string | undefined {
  const value = opening.attributes[name];
  if (value === undefined) {
    if (required) fail(source, "TEXT_IMPORT", `<import> requires ${name}.`, opening.start);
    return undefined;
  }
  if (typeof value !== "string") fail(source, "TEXT_IMPORT", `<import> ${name} must be a string.`, opening.start);
  return value;
}

function importRequest(source: SourceUnit, opening: OpeningTag): TextImportRequest {
  if (opening.name !== "import" || !opening.selfClosing) {
    fail(source, "TEXT_IMPORT", "Imports must use <import .../>.", opening.start);
  }
  const unknown = Object.keys(opening.attributes).filter((name) => !["from", "as", "using"].includes(name));
  if (unknown.length) fail(source, "TEXT_IMPORT", `Unknown import attribute "${unknown[0]}".`, opening.start);
  const alias = stringAttribute(source, opening, "as");
  if (alias !== undefined && !ALIAS.test(alias)) fail(source, "TEXT_IMPORT_ALIAS", `Invalid alias "${alias}".`, opening.start);
  const using = stringAttribute(source, opening, "using");
  if (using !== undefined && alias === undefined) {
    fail(source, "TEXT_IMPORT_USING", "A source import using a codec requires an alias.", opening.start);
  }
  return {
    from: stringAttribute(source, opening, "from", true)!,
    ...(alias === undefined ? {} : { alias }),
    ...(using === undefined ? {} : { using }),
    range: { start: opening.start, end: opening.end },
  };
}

export function discoverText(source: SourceUnit): TextDiscovery {
  let cursor = skipTrivia(source, 0);
  const root = parseOpeningTag(source, cursor);
  if (root.name !== "svml" || root.selfClosing) fail(source, "TEXT_ROOT", "Document must open with <svml>.", cursor);
  if (Object.keys(root.attributes).length) fail(source, "TEXT_ROOT_ATTRIBUTE", "<svml> declares no attributes.", cursor);
  cursor = root.end;
  const imports: TextImportRequest[] = [];
  while (true) {
    cursor = skipTrivia(source, cursor);
    if (source.text.startsWith("</", cursor) || source.text[cursor] !== "<") break;
    const opening = parseOpeningTag(source, cursor);
    if (opening.name !== "import") break;
    imports.push(importRequest(source, opening));
    cursor = imports.at(-1)!.range.end;
  }
  return { imports, bodyStart: cursor };
}

export function closeDocument(source: SourceUnit, start: number): number {
  const close = parseClose(source, start);
  if (close.name !== "svml") fail(source, "TEXT_ROOT_CLOSE", `Expected </svml>, received </${close.name}>.`, start);
  const end = skipTrivia(source, close.end);
  if (end !== source.text.length) fail(source, "TEXT_TRAILING", "Only trivia may follow </svml>.", end);
  return end;
}

export function skipTextTrivia(source: SourceUnit, start: number): number {
  return skipTrivia(source, start);
}
