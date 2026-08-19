import type { CanonicalValue } from "@hypit/protocol";

import type {
  ParsedSvsProperty,
  ParsedSvsRecipe,
  ParsedSvsSheet,
  SvsRecipe,
} from "./types.js";

const RULE = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+/u;
const PROPERTY = /^[a-z][a-z0-9-]*/u;
const SHEET_ID = /^[a-z][a-z0-9_-]{0,63}$/u;

export class SvsSyntaxError extends Error {
  readonly code: string;
  readonly sourceName: string;
  readonly offset: number;

  constructor(code: string, message: string, sourceName: string, offset: number) {
    super(`${sourceName}:${offset}: ${message}`);
    this.name = "SvsSyntaxError";
    this.code = code;
    this.sourceName = sourceName;
    this.offset = offset;
  }
}

function fail(sourceName: string, code: string, message: string, offset: number): never {
  throw new SvsSyntaxError(code, message, sourceName, offset);
}

function withoutComments(sourceName: string, text: string): string {
  const output = [...text];
  let cursor = 0;
  let quote: "\"" | "'" | undefined;
  let escaped = false;
  while (cursor < text.length) {
    const character = text[cursor];
    if (escaped) {
      escaped = false;
      cursor += 1;
      continue;
    }
    if (character === "\\" && quote !== undefined) {
      escaped = true;
      cursor += 1;
      continue;
    }
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      cursor += 1;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      cursor += 1;
      continue;
    }
    if (!text.startsWith("/*", cursor)) {
      cursor += 1;
      continue;
    }
    const end = text.indexOf("*/", cursor + 2);
    if (end < 0) fail(sourceName, "SVS_COMMENT_UNCLOSED", "Unclosed comment.", cursor);
    for (let index = cursor; index < end + 2; index += 1) {
      if (output[index] !== "\n" && output[index] !== "\r") output[index] = " ";
    }
    cursor = end + 2;
  }
  return output.join("");
}

function closingBrace(text: string, start: number, limit: number): number {
  let quote: "\"" | "'" | undefined;
  let escaped = false;
  for (let cursor = start; cursor < limit; cursor += 1) {
    const character = text[cursor];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== undefined) {
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "}") return cursor;
  }
  return -1;
}

function skipSpace(text: string, start: number): number {
  let cursor = start;
  while (/\s/u.test(text[cursor] ?? "")) cursor += 1;
  return cursor;
}

function parseAttributes(
  sourceName: string,
  raw: string,
  offset: number,
): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {};
  const attribute = /([a-z][a-z0-9-]*)\s*=\s*(["'])(.*?)\2/gu;
  let cursor = 0;
  for (const match of raw.matchAll(attribute)) {
    const start = match.index ?? 0;
    if (raw.slice(cursor, start).trim().length > 0) {
      fail(sourceName, "SVS_SHEET_ATTRIBUTE", "Malformed <sheet> attribute.", offset + cursor);
    }
    const name = match[1] as string;
    if (Object.hasOwn(attributes, name)) {
      fail(sourceName, "SVS_SHEET_ATTRIBUTE_DUPLICATE", `Duplicate sheet attribute ${name}.`, offset + start);
    }
    attributes[name] = match[3] as string;
    cursor = start + match[0].length;
  }
  if (raw.slice(cursor).trim().length > 0) {
    fail(sourceName, "SVS_SHEET_ATTRIBUTE", "Malformed <sheet> attribute.", offset + cursor);
  }
  const unknown = Object.keys(attributes).filter((name) => name !== "version" && name !== "id");
  if (unknown.length > 0) fail(sourceName, "SVS_SHEET_ATTRIBUTE", `Unknown sheet attribute ${unknown[0]}.`, offset);
  if (attributes.version !== "1") fail(sourceName, "SVS_VERSION", '<sheet> requires version="1".', offset);
  if (attributes.id !== undefined && !SHEET_ID.test(attributes.id)) {
    fail(sourceName, "SVS_SHEET_ID", "Sheet id must be a canonical lower-case identifier.", offset);
  }
  return attributes;
}

function parseValue(sourceName: string, text: string, offset: number): CanonicalValue {
  const value = text.trim();
  if (value.length === 0) fail(sourceName, "SVS_VALUE_EMPTY", "Recipe property value is empty.", offset);
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value)) return Number(value);
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function valueSemicolon(text: string, start: number): number {
  let quote: "\"" | "'" | undefined;
  let escaped = false;
  for (let cursor = start; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== undefined) {
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === ";") return cursor;
  }
  return -1;
}

function parseProperties(
  sourceName: string,
  text: string,
  offset: number,
): {
  readonly values: Readonly<Record<string, CanonicalValue>>;
  readonly parsed: readonly ParsedSvsProperty[];
} {
  const properties: Record<string, CanonicalValue> = {};
  const parsed: ParsedSvsProperty[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    cursor = skipSpace(text, cursor);
    if (cursor >= text.length) break;
    const propertyStart = cursor;
    const match = PROPERTY.exec(text.slice(cursor));
    if (!match) fail(sourceName, "SVS_PROPERTY", "Expected a recipe property.", offset + cursor);
    const name = match[0];
    if (Object.hasOwn(properties, name)) {
      fail(sourceName, "SVS_PROPERTY_DUPLICATE", `Duplicate property ${name}.`, offset + cursor);
    }
    cursor += name.length;
    cursor = skipSpace(text, cursor);
    if (text[cursor] !== ":") fail(sourceName, "SVS_PROPERTY_COLON", `Property ${name} requires ':'.`, offset + cursor);
    const valueStart = cursor + 1;
    const semicolon = valueSemicolon(text, valueStart);
    if (semicolon < 0) fail(sourceName, "SVS_PROPERTY_SEMICOLON", `Property ${name} requires ';'.`, offset + valueStart);
    properties[name] = parseValue(sourceName, text.slice(valueStart, semicolon), offset + valueStart);
    let trimmedStart = valueStart;
    let trimmedEnd = semicolon;
    while (/\s/u.test(text[trimmedStart] ?? "")) trimmedStart += 1;
    while (trimmedEnd > trimmedStart && /\s/u.test(text[trimmedEnd - 1] ?? "")) trimmedEnd -= 1;
    parsed.push({
      name,
      range: { start: offset + propertyStart, end: offset + semicolon + 1 },
      valueRange: { start: offset + trimmedStart, end: offset + trimmedEnd },
    });
    cursor = semicolon + 1;
  }
  return { values: properties, parsed };
}

export function parseSvs(sourceName: string, source: string): ParsedSvsSheet {
  const text = withoutComments(sourceName, source);
  let cursor = skipSpace(text, 0);
  if (!text.startsWith("<sheet", cursor)) fail(sourceName, "SVS_ROOT", "Source must open with <sheet>.", cursor);
  const openEnd = text.indexOf(">", cursor + 6);
  if (openEnd < 0) fail(sourceName, "SVS_ROOT", "Opening <sheet> is not closed.", cursor);
  const attributes = parseAttributes(sourceName, text.slice(cursor + 6, openEnd), cursor + 6);
  cursor = openEnd + 1;
  const close = text.indexOf("</sheet>", cursor);
  if (close < 0) fail(sourceName, "SVS_ROOT_UNCLOSED", "Source is missing </sheet>.", source.length);
  if (text.slice(close + "</sheet>".length).trim().length > 0) {
    fail(sourceName, "SVS_TRAILING", "Only trivia may follow </sheet>.", close + "</sheet>".length);
  }
  const recipes: ParsedSvsRecipe[] = [];
  const paths = new Set<string>();
  while (cursor < close) {
    cursor = skipSpace(text, cursor);
    if (cursor >= close) break;
    const match = RULE.exec(text.slice(cursor));
    if (!match) fail(sourceName, "SVS_RULE", "Expected a dotted recipe path.", cursor);
    const path = match[0];
    if (paths.has(path)) fail(sourceName, "SVS_RULE_DUPLICATE", `Duplicate recipe ${path}.`, cursor);
    paths.add(path);
    const start = cursor;
    cursor += path.length;
    cursor = skipSpace(text, cursor);
    if (text[cursor] !== "{") fail(sourceName, "SVS_RULE_OPEN", `Recipe ${path} requires '{'.`, cursor);
    const blockStart = cursor + 1;
    const blockEnd = closingBrace(text, blockStart, close);
    if (blockEnd < 0 || blockEnd > close) fail(sourceName, "SVS_RULE_UNCLOSED", `Recipe ${path} is not closed.`, start);
    const parsedProperties = parseProperties(sourceName, text.slice(blockStart, blockEnd), blockStart);
    const value: SvsRecipe = {

      path,
      properties: parsedProperties.values,
    };
    recipes.push({ value, range: { start, end: blockEnd + 1 }, properties: parsedProperties.parsed });
    cursor = blockEnd + 1;
  }
  return {
    ...(attributes.id === undefined ? {} : { id: attributes.id }),
    recipes,
  };
}
