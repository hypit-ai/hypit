import { decodeSourceText, type SourceRange, type SourceUnit } from "@hypit/source";

import { SvmlFrontendError } from "./error.js";
import type {
  SvmlDeclarationSyntax,
  SvmlDocumentSyntax,
  SvmlFieldSyntax,
  SvmlImportSyntax,
  SvmlListSyntax,
  SvmlRecordEntrySyntax,
  SvmlRecordSyntax,
  SvmlValueSyntax,
} from "./types.js";

const IDENTIFIER_START = /[A-Za-z_]/u;
const IDENTIFIER_CONTINUE = /[A-Za-z0-9_-]/u;
const REFERENCE_CONTINUE = /[A-Za-z0-9_.:-]/u;

class Parser {
  readonly source: SourceUnit;
  readonly text: string;
  cursor = 0;

  constructor(source: SourceUnit) {
    this.source = source;
    this.text = decodeSourceText(source);
  }

  fail(code: string, message: string, offset = this.cursor): never {
    throw new SvmlFrontendError(code, message, this.source.name, offset);
  }

  starts(value: string): boolean {
    return this.text.startsWith(value, this.cursor);
  }

  skipTrivia(): number {
    const start = this.cursor;
    while (this.cursor < this.text.length) {
      if (/\s/u.test(this.text[this.cursor] ?? "")) {
        this.cursor += 1;
        continue;
      }
      if (this.starts("//")) {
        const end = this.text.indexOf("\n", this.cursor + 2);
        this.cursor = end < 0 ? this.text.length : end + 1;
        continue;
      }
      if (this.starts("/*")) {
        const end = this.text.indexOf("*/", this.cursor + 2);
        if (end < 0) this.fail("SVML_COMMENT_UNCLOSED", "Unclosed block comment.");
        this.cursor = end + 2;
        continue;
      }
      break;
    }
    return start;
  }

  identifier(subject: string): string {
    const start = this.cursor;
    if (!IDENTIFIER_START.test(this.text[this.cursor] ?? "")) {
      this.fail("SVML_IDENTIFIER", `Expected ${subject}.`);
    }
    this.cursor += 1;
    while (IDENTIFIER_CONTINUE.test(this.text[this.cursor] ?? "")) this.cursor += 1;
    return this.text.slice(start, this.cursor);
  }

  expect(token: string, subject = token): void {
    if (!this.starts(token)) this.fail("SVML_TOKEN", `Expected ${subject}.`);
    this.cursor += token.length;
  }

  quoted(): { readonly value: string; readonly range: SourceRange } {
    const start = this.cursor;
    this.expect("\"", "a quoted string");
    let escaped = false;
    while (this.cursor < this.text.length) {
      const character = this.text[this.cursor]!;
      if (character === "\n" || character === "\r") {
        this.fail("SVML_STRING_NEWLINE", "Quoted strings cannot contain a raw newline.", this.cursor);
      }
      this.cursor += 1;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === "\"") {
        const token = this.text.slice(start, this.cursor);
        try {
          return { value: JSON.parse(token) as string, range: { start, end: this.cursor } };
        } catch {
          this.fail("SVML_STRING_ESCAPE", "Quoted string has an invalid escape.", start);
        }
      }
    }
    this.fail("SVML_STRING_UNCLOSED", "Unclosed quoted string.", start);
  }

  raw(ownedStart: number): SvmlValueSyntax {
    const start = this.cursor;
    this.expect("<<");
    const marker = this.identifier("a raw text marker");
    if (this.starts("\r\n")) this.cursor += 2;
    else if (this.starts("\n")) this.cursor += 1;
    else this.fail("SVML_RAW_NEWLINE", "Raw text marker must end its line.");
    const bodyStart = this.cursor;
    let markerStart = bodyStart;
    while (markerStart <= this.text.length) {
      const lineEnd = this.text.indexOf("\n", markerStart);
      const end = lineEnd < 0 ? this.text.length : lineEnd;
      const line = this.text.slice(markerStart, end).replace(/\r$/u, "");
      if (line.trim() === marker && line.slice(0, line.indexOf(marker)).trim().length === 0) {
        this.cursor = end;
        if (lineEnd >= 0) this.cursor += 1;
        return {
          kind: "literal",
          value: this.text.slice(bodyStart, markerStart),
          style: "raw",
          range: { start, end: this.cursor },
          ownedRange: { start: ownedStart, end: this.cursor },
        };
      }
      if (lineEnd < 0) break;
      markerStart = lineEnd + 1;
    }
    this.fail("SVML_RAW_UNCLOSED", `Raw text is missing closing marker ${marker}.`, start);
  }

  reference(ownedStart: number): SvmlValueSyntax {
    const start = this.cursor;
    this.expect("@");
    const pathStart = this.cursor;
    if (!IDENTIFIER_START.test(this.text[this.cursor] ?? "")) {
      this.fail("SVML_REFERENCE", "Reference path is empty.", start);
    }
    this.cursor += 1;
    while (REFERENCE_CONTINUE.test(this.text[this.cursor] ?? "")) this.cursor += 1;
    const path = this.text.slice(pathStart, this.cursor);
    if (path.endsWith(".") || path.includes("..")) {
      this.fail("SVML_REFERENCE", `Reference @${path} has an empty segment.`, start);
    }
    return {
      kind: "reference",
      path,
      range: { start, end: this.cursor },
      ownedRange: { start: ownedStart, end: this.cursor },
    };
  }

  bare(ownedStart: number): SvmlValueSyntax {
    const start = this.cursor;
    while (this.cursor < this.text.length
      && !/[\s,\]}]/u.test(this.text[this.cursor] ?? "")) this.cursor += 1;
    if (this.cursor === start) this.fail("SVML_LITERAL", "Expected a literal value.");
    return {
      kind: "literal",
      value: this.text.slice(start, this.cursor),
      style: "bare",
      range: { start, end: this.cursor },
      ownedRange: { start: ownedStart, end: this.cursor },
    };
  }

  list(ownedStart: number): SvmlListSyntax {
    const start = this.cursor;
    this.expect("[");
    const contentStart = this.cursor;
    const items: SvmlValueSyntax[] = [];
    this.skipTrivia();
    while (!this.starts("]")) {
      const itemOwnedStart = this.cursor;
      const item = this.value(itemOwnedStart);
      items.push(item);
      this.skipTrivia();
      if (this.starts("]")) break;
      this.expect(",", "a comma between list values");
      this.skipTrivia();
    }
    const contentEnd = this.cursor;
    this.expect("]");
    return {
      kind: "list",
      items,
      contentRange: { start: contentStart, end: contentEnd },
      range: { start, end: this.cursor },
      ownedRange: { start: ownedStart, end: this.cursor },
    };
  }

  record(ownedStart: number): SvmlRecordSyntax {
    const start = this.cursor;
    this.expect("{");
    const contentStart = this.cursor;
    const entries: SvmlRecordEntrySyntax[] = [];
    this.skipTrivia();
    while (!this.starts("}")) {
      const entryOwnedStart = this.cursor;
      const entryStart = this.cursor;
      const name = this.identifier("a record entry name");
      this.skipTrivia();
      this.expect(":");
      this.skipTrivia();
      const value = this.value(this.cursor);
      entries.push({
        kind: "entry",
        name,
        value,
        range: { start: entryStart, end: value.range.end },
        ownedRange: { start: entryOwnedStart, end: value.range.end },
      });
      this.skipTrivia();
      if (this.starts("}")) break;
      this.expect(",", "a comma between record entries");
      this.skipTrivia();
    }
    const contentEnd = this.cursor;
    this.expect("}");
    return {
      kind: "record",
      entries,
      contentRange: { start: contentStart, end: contentEnd },
      range: { start, end: this.cursor },
      ownedRange: { start: ownedStart, end: this.cursor },
    };
  }

  value(ownedStart: number): SvmlValueSyntax {
    if (this.starts("\"")) {
      const result = this.quoted();
      return { kind: "literal", value: result.value, style: "quoted", range: result.range,
        ownedRange: { start: ownedStart, end: result.range.end } };
    }
    if (this.starts("<<")) return this.raw(ownedStart);
    if (this.starts("@")) return this.reference(ownedStart);
    if (this.starts("[")) return this.list(ownedStart);
    if (this.starts("{")) return this.record(ownedStart);
    return this.bare(ownedStart);
  }

  field(name: string, start: number, ownedStart: number): SvmlFieldSyntax {
    this.expect(":");
    this.skipTrivia();
    const value = this.value(this.cursor);
    return {
      kind: "field",
      name,
      value,
      range: { start, end: value.range.end },
      ownedRange: { start: ownedStart, end: value.range.end },
    };
  }

  declaration(root: boolean, ownedStart: number): SvmlDeclarationSyntax {
    const start = this.cursor;
    const first = this.identifier(root ? "a module alias" : "a child declaration name");
    let moduleAlias: string | undefined;
    let name = first;
    if (root) {
      this.expect(".", "a dot between module alias and declaration name");
      moduleAlias = first;
      name = this.identifier("a declaration name");
    }
    this.skipTrivia();
    let label: string | undefined;
    let labelRange: SourceRange | undefined;
    if (this.starts("\"")) {
      const result = this.quoted();
      label = result.value;
      labelRange = result.range;
      this.skipTrivia();
    }
    this.expect("{");
    const contentStart = this.cursor;
    const fields: SvmlFieldSyntax[] = [];
    const children: SvmlDeclarationSyntax[] = [];
    let sawChild = false;
    this.skipTrivia();
    while (!this.starts("}")) {
      const itemOwnedStart = this.cursor;
      const itemStart = this.cursor;
      const itemName = this.identifier("a field or child declaration name");
      this.skipTrivia();
      if (this.starts(":")) {
        if (sawChild) {
          this.fail("SVML_FIELD_AFTER_CHILD", "Fields must precede package-owned child declarations.", itemStart);
        }
        fields.push(this.field(itemName, itemStart, itemOwnedStart));
      } else {
        this.cursor = itemStart;
        children.push(this.declaration(false, itemOwnedStart));
        sawChild = true;
      }
      this.skipTrivia();
    }
    const contentEnd = this.cursor;
    this.expect("}");
    return {
      kind: "declaration",
      ...(moduleAlias === undefined ? {} : { moduleAlias }),
      name,
      ...(label === undefined ? {} : { label }),
      ...(labelRange === undefined ? {} : { labelRange }),
      fields,
      children,
      contentRange: { start: contentStart, end: contentEnd },
      range: { start, end: this.cursor },
      ownedRange: { start: ownedStart, end: this.cursor },
    };
  }

  import(ownedStart: number): SvmlImportSyntax {
    const start = this.cursor;
    const keyword = this.identifier("module or source");
    if (keyword !== "module" && keyword !== "source") {
      this.fail("SVML_IMPORT", "Expected module or source import.", start);
    }
    this.skipTrivia();
    const alias = this.identifier("an import alias");
    this.skipTrivia();
    const fromKeyword = this.identifier("from");
    if (fromKeyword !== "from") this.fail("SVML_IMPORT", "Import requires from.", this.cursor);
    this.skipTrivia();
    const from = this.quoted();
    return {
      kind: keyword,
      alias,
      from: from.value,
      range: { start, end: from.range.end },
      ownedRange: { start: ownedStart, end: from.range.end },
    };
  }

  document(): SvmlDocumentSyntax {
    const imports: SvmlImportSyntax[] = [];
    const declarations: SvmlDeclarationSyntax[] = [];
    const aliases = new Set<string>();
    this.skipTrivia();
    while (this.cursor < this.text.length) {
      const ownedStart = this.cursor;
      const tokenStart = this.cursor;
      const keyword = this.identifier("an import or declaration");
      this.cursor = tokenStart;
      if (keyword === "module" || keyword === "source") {
        if (declarations.length > 0) {
          this.fail("SVML_IMPORT_ORDER", "Imports must precede declarations.", tokenStart);
        }
        const item = this.import(ownedStart);
        if (aliases.has(item.alias)) this.fail("SVML_IMPORT_ALIAS", `Duplicate import alias ${item.alias}.`, tokenStart);
        aliases.add(item.alias);
        imports.push(item);
      } else {
        declarations.push(this.declaration(true, ownedStart));
      }
      this.skipTrivia();
    }
    return { source: this.source, text: this.text, imports, declarations };
  }
}

export function parseSvmlDocument(source: SourceUnit): SvmlDocumentSyntax {
  return new Parser(source).document();
}

export function printSvmlDocument(document: SvmlDocumentSyntax): string {
  return document.text;
}
