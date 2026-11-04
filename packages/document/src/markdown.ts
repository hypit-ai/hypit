import type {
  AuthorDocumentBlock,
  AuthorDocumentBlockDraft,
  AuthorDocumentInline,
  AuthorDocumentInlineDraft,
  AuthorDocumentTextMark,
} from "@hypit/hypit/author";
import type { SourceRange } from "@hypit/hypit/source";
import type { PhrasingContent, RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { mathFromMarkdown } from "mdast-util-math";
import { gfm } from "micromark-extension-gfm";
import { math } from "micromark-extension-math";

export type ParsedDocument = {
  readonly source: string;
  readonly blocks: readonly AuthorDocumentBlock[];
};

type Positioned = { readonly type: string; readonly position?: {
  readonly start: { readonly offset?: number | undefined };
  readonly end: { readonly offset?: number | undefined };
} | undefined };

function range(node: Positioned): SourceRange {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) throw new Error(`Markdown ${node.type} has no source range.`);
  return { start, end };
}

function nodeId(node: Positioned): string {
  const held = range(node);
  return `document:${node.type}:${held.start}:${held.end}`;
}

/** Keep offsets stable while allowing Feishu's documented H7-H9 shorthand through CommonMark. */
function normalizeDeepHeadings(source: string): string {
  const lines = source.match(/.*(?:\r\n|\n|\r|$)/gu) ?? [];
  let fenced: { readonly marker: "`" | "~"; readonly size: number } | undefined;
  return lines.map((line) => {
    const fence = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
    if (fence !== null) {
      const marker = fence[1]![0] as "`" | "~";
      const size = fence[1]!.length;
      if (fenced === undefined) fenced = { marker, size };
      else if (fenced.marker === marker && size >= fenced.size) fenced = undefined;
      return line;
    }
    if (fenced !== undefined) return line;
    const heading = /^( {0,3})(#{7,9})(?=[ \t]+|(?:\r?\n)?$)/u.exec(line);
    if (heading === null) return line;
    const start = heading[1]!.length + 6;
    const end = heading[1]!.length + heading[2]!.length;
    return `${line.slice(0, start)}${" ".repeat(end - start)}${line.slice(end)}`;
  }).join("");
}

function originalHeadingLevel(source: string, node: Positioned, fallback: number): number {
  const held = range(node);
  const lineEnd = source.indexOf("\n", held.start);
  const line = source.slice(held.start, lineEnd < 0 ? source.length : lineEnd);
  const match = /^ {0,3}(#{1,9})(?=[ \t]+|$)/u.exec(line);
  return match === null ? fallback : match[1]!.length;
}

function withMark(marks: readonly AuthorDocumentTextMark[], mark: AuthorDocumentTextMark): readonly AuthorDocumentTextMark[] {
  return marks.includes(mark) ? marks : [...marks, mark];
}

function rawInlines(
  children: readonly PhrasingContent[],
  source: string,
  marks: readonly AuthorDocumentTextMark[] = [],
): AuthorDocumentInline[] {
  return children.flatMap((child): AuthorDocumentInline[] => {
    const held = range(child);
    switch (child.type) {
      case "text":
        return [{ kind: "text", value: child.value, marks, range: held }];
      case "strong":
        return rawInlines(child.children, source, withMark(marks, "bold"));
      case "emphasis":
        return rawInlines(child.children, source, withMark(marks, "italic"));
      case "delete":
        return rawInlines(
          child.children,
          source,
          withMark(marks, source.startsWith("~~", held.start) ? "strikethrough" : "underline"),
        );
      case "inlineCode":
        return [{ kind: "code", value: child.value, range: held }];
      case "inlineMath":
        return [{ kind: "math", value: child.value, range: held }];
      case "link":
        return [{
          kind: "link",
          url: child.url,
          ...(child.title === null || child.title === undefined ? {} : { title: child.title }),
          children: rawInlines(child.children, source, marks),
          range: held,
        }];
      case "image":
        return [{
          kind: "image",
          url: child.url,
          alt: child.alt ?? "",
          ...(child.title === null || child.title === undefined ? {} : { title: child.title }),
          range: held,
        }];
      case "break":
        return [{ kind: "break", range: held }];
      case "footnoteReference":
        return [{ kind: "footnote-reference", label: child.label ?? child.identifier, range: held }];
      case "linkReference":
        return [{
          kind: "link-reference",
          label: child.label ?? child.identifier,
          referenceType: child.referenceType,
          children: rawInlines(child.children, source, marks),
          range: held,
        }];
      case "imageReference":
        return [{
          kind: "image-reference",
          label: child.label ?? child.identifier,
          referenceType: child.referenceType,
          alt: child.alt ?? "",
          range: held,
        }];
      case "html":
        throw new Error("Document Markdown does not accept raw HTML.");
      default:
        throw new Error(`Unsupported Markdown inline node ${(child as { readonly type: string }).type}.`);
    }
  });
}

function inlines(children: readonly PhrasingContent[], source: string): readonly AuthorDocumentInline[] {
  return rawInlines(children, source);
}

function block(node: RootContent, source: string): AuthorDocumentBlock {
  const base = { node: nodeId(node), range: range(node) };
  switch (node.type) {
    case "paragraph": return { ...base, kind: "paragraph", content: inlines(node.children, source) };
    case "heading": return {
      ...base,
      kind: "heading",
      level: originalHeadingLevel(source, node, node.depth),
      content: inlines(node.children, source),
    };
    case "blockquote": return { ...base, kind: "blockquote", children: node.children.map((child) => block(child, source)) };
    case "list": return {
      ...base,
      kind: "list",
      ordered: node.ordered === true,
      ...(node.start === null || node.start === undefined ? {} : { start: node.start }),
      children: node.children.map((child) => block(child, source)),
    };
    case "listItem": return {
      ...base,
      kind: "list-item",
      ...(node.checked === null || node.checked === undefined ? {} : { checked: node.checked }),
      children: node.children.map((child) => block(child, source)),
    };
    case "code": return {
      ...base,
      kind: "code",
      ...(node.lang === null || node.lang === undefined ? {} : { language: node.lang }),
      ...(node.meta === null || node.meta === undefined ? {} : { meta: node.meta }),
      value: node.value,
    };
    case "thematicBreak": return { ...base, kind: "divider" };
    case "table": return {
      ...base,
      kind: "table",
      align: node.align ?? [],
      children: node.children.map((child) => block(child, source)),
    };
    case "tableRow": return { ...base, kind: "table-row", children: node.children.map((child) => block(child, source)) };
    case "tableCell": return { ...base, kind: "table-cell", content: inlines(node.children, source) };
    case "math": return { ...base, kind: "math", value: node.value };
    case "footnoteDefinition": return {
      ...base,
      kind: "footnote-definition",
      label: node.label ?? node.identifier,
      children: node.children.map((child) => block(child, source)),
    };
    case "definition": return {
      ...base,
      kind: "link-definition",
      label: node.label ?? node.identifier,
      url: node.url,
      ...(node.title === null || node.title === undefined ? {} : { title: node.title }),
    };
    case "html":
      throw new Error("Document Markdown does not accept raw HTML.");
    default:
      throw new Error(`Unsupported Markdown block node ${(node as { readonly type: string }).type}.`);
  }
}

export function parseDocument(source: string): ParsedDocument {
  const tree = fromMarkdown(normalizeDeepHeadings(source), {
    extensions: [gfm({ singleTilde: true }), math()],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
  });
  return { source, blocks: tree.children.map((child) => block(child, source)) };
}

export function printDocument(document: ParsedDocument): string {
  return document.source;
}

function escapeText(value: string): string {
  return value.replace(/[\\`*_[\]<>~]/gu, (character) => `\\${character}`);
}

function inlineMarkdown(inline: AuthorDocumentInlineDraft): string {
  switch (inline.kind) {
    case "text": {
      let value = escapeText(inline.value);
      if (inline.marks.includes("italic")) value = `*${value}*`;
      if (inline.marks.includes("bold")) value = `**${value}**`;
      if (inline.marks.includes("underline")) value = `~${value}~`;
      if (inline.marks.includes("strikethrough")) value = `~~${value}~~`;
      return value;
    }
    case "code": return `\`${inline.value.replaceAll("`", "\\`")}\``;
    case "math": return `$${inline.value}$`;
    case "link": return `[${inline.children.map(inlineMarkdown).join("")}](${inline.url}${inline.title === undefined ? "" : ` \"${inline.title.replaceAll("\"", "\\\"")}\"`})`;
    case "image": return `![${inline.alt}](${inline.url}${inline.title === undefined ? "" : ` \"${inline.title.replaceAll("\"", "\\\"")}\"`})`;
    case "break": return "  \n";
    case "footnote-reference": return `[^${inline.label}]`;
    case "link-reference": {
      const text = inline.children.map(inlineMarkdown).join("");
      return inline.referenceType === "shortcut" ? `[${text}]`
        : inline.referenceType === "collapsed" ? `[${text}][]` : `[${text}][${inline.label}]`;
    }
    case "image-reference": {
      const alt = inline.alt ?? "";
      return inline.referenceType === "shortcut" ? `![${alt}]`
        : inline.referenceType === "collapsed" ? `![${alt}][]` : `![${alt}][${inline.label}]`;
    }
  }
}

function flow(value: AuthorDocumentBlockDraft): string {
  switch (value.kind) {
    case "paragraph": return value.content.map(inlineMarkdown).join("");
    case "heading": return `${"#".repeat(value.level)} ${value.content.map(inlineMarkdown).join("")}`;
    case "blockquote": return value.children.map(flow).join("\n\n").split("\n").map((line) => `> ${line}`).join("\n");
    case "list": {
      const start = value.start ?? 1;
      return value.children.map((item, index) => {
        if (item.kind !== "list-item") throw new Error("Document list accepts only list-item blocks.");
        const marker = value.ordered ? `${start + index}. ` : "- ";
        const task = item.checked === undefined ? "" : `[${item.checked ? "x" : " "}] `;
        const body = item.children.map(flow).join("\n\n");
        const lines = body.split("\n");
        return `${marker}${task}${lines[0] ?? ""}${lines.slice(1).map((line) => `\n${" ".repeat(marker.length)}${line}`).join("")}`;
      }).join("\n");
    }
    case "list-item": return value.children.map(flow).join("\n\n");
    case "code": return `\`\`\`${value.language ?? ""}${value.meta === undefined ? "" : ` ${value.meta}`}\n${value.value}\n\`\`\``;
    case "divider": return "---";
    case "math": return `$$\n${value.value}\n$$`;
    case "table": {
      const rows = value.children.map((row) => {
        if (row.kind !== "table-row") throw new Error("Document table accepts only table-row blocks.");
        return row.children.map((cell) => {
          if (cell.kind !== "table-cell") throw new Error("Document table row accepts only table-cell blocks.");
          return cell.content.map(inlineMarkdown).join("").replaceAll("|", "\\|");
        });
      });
      const columns = Math.max(1, ...rows.map((row) => row.length));
      const first = rows[0] ?? Array.from({ length: columns }, () => "");
      const delimiter = Array.from({ length: columns }, (_, index) => {
        const align = value.align[index] ?? null;
        return align === "left" ? ":---" : align === "right" ? "---:" : align === "center" ? ":---:" : "---";
      });
      return [first, delimiter, ...rows.slice(1)].map((row) => `| ${Array.from({ length: columns }, (_, index) => row[index] ?? "").join(" | ")} |`).join("\n");
    }
    case "table-row": return value.children.map(flow).join(" | ");
    case "table-cell": return value.content.map(inlineMarkdown).join("");
    case "footnote-definition": {
      const body = value.children.map(flow).join("\n\n");
      const lines = body.split("\n");
      return `[^${value.label}]: ${lines[0] ?? ""}${lines.slice(1).map((line) => `\n    ${line}`).join("")}`;
    }
    case "link-definition": return `[${value.label}]: ${value.url}${value.title === undefined ? "" : ` \"${value.title.replaceAll("\"", "\\\"")}\"`}`;
  }
}

export function serializeDocumentBlock(value: AuthorDocumentBlockDraft): string {
  if (value.kind === "heading" && (!Number.isSafeInteger(value.level) || value.level < 1 || value.level > 9)) {
    throw new Error("Document heading level must be an integer from 1 through 9.");
  }
  return flow(value);
}
