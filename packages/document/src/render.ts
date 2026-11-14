import type { AuthorDocumentBlock, AuthorDocumentInline, AuthorDocumentTextMark } from "@hypit/generation-authoring/author";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

function safeUrl(value: string): string {
  const trimmed = value.trim();
  const scheme = /^([a-z][a-z\d+.-]*:|\/\/)/iu.exec(trimmed);
  if (scheme !== null && !/^(?:https?:|mailto:)/iu.test(scheme[1]!)) return "#";
  return escapeHtml(trimmed);
}

function marked(value: string, marks: readonly AuthorDocumentTextMark[]): string {
  let result = escapeHtml(value);
  if (marks.includes("italic")) result = `<em>${result}</em>`;
  if (marks.includes("bold")) result = `<strong>${result}</strong>`;
  if (marks.includes("underline")) result = `<u>${result}</u>`;
  if (marks.includes("strikethrough")) result = `<s>${result}</s>`;
  return result;
}

function inline(value: AuthorDocumentInline): string {
  switch (value.kind) {
    case "text": return marked(value.value, value.marks);
    case "code": return `<code>${escapeHtml(value.value)}</code>`;
    case "math": return `<span class="hypit-document-math" data-math="inline">${escapeHtml(value.value)}</span>`;
    case "link": return `<a href="${safeUrl(value.url)}"${value.title === undefined ? "" : ` title="${escapeHtml(value.title)}"`}>${value.children.map(inline).join("")}</a>`;
    case "image": return `<img src="${safeUrl(value.url)}" alt="${escapeHtml(value.alt)}"${value.title === undefined ? "" : ` title="${escapeHtml(value.title)}"`}/>`;
    case "break": return "<br/>";
    case "footnote-reference": return `<sup><a href="#footnote-${escapeHtml(value.label)}">${escapeHtml(value.label)}</a></sup>`;
    case "link-reference": return value.children.map(inline).join("");
    case "image-reference": return escapeHtml(value.alt ?? value.label);
  }
}

function block(value: AuthorDocumentBlock): string {
  switch (value.kind) {
    case "paragraph": return `<p>${value.content.map(inline).join("")}</p>`;
    case "heading": {
      const level = Math.min(value.level, 6);
      const semantics = value.level > 6 ? ` role="heading" aria-level="${value.level}"` : "";
      return `<h${level}${semantics} data-heading-level="${value.level}">${value.content.map(inline).join("")}</h${level}>`;
    }
    case "blockquote": return `<blockquote>${value.children.map(block).join("")}</blockquote>`;
    case "list": {
      const tag = value.ordered ? "ol" : "ul";
      return `<${tag}${value.start === undefined || !value.ordered ? "" : ` start="${value.start}"`}>${value.children.map(block).join("")}</${tag}>`;
    }
    case "list-item": return `<li${value.checked === undefined ? "" : " class=\"task-list-item\""}>${value.checked === undefined ? "" : `<input type="checkbox" disabled${value.checked ? " checked" : ""}/>`}${value.children.map(block).join("")}</li>`;
    case "code": return `<pre><code${value.language === undefined ? "" : ` class="language-${escapeHtml(value.language)}"`}>${escapeHtml(value.value)}</code></pre>`;
    case "divider": return "<hr/>";
    case "table": {
      const [head, ...body] = value.children;
      const renderRow = (row: AuthorDocumentBlock, header: boolean): string => {
        if (row.kind !== "table-row") throw new Error("Document table accepts only table rows.");
        const tag = header ? "th" : "td";
        return `<tr>${row.children.map((cell) => {
          if (cell.kind !== "table-cell") throw new Error("Document table row accepts only table cells.");
          return `<${tag}>${cell.content.map(inline).join("")}</${tag}>`;
        }).join("")}</tr>`;
      };
      return `<table>${head === undefined ? "" : `<thead>${renderRow(head, true)}</thead>`}${body.length === 0 ? "" : `<tbody>${body.map((row) => renderRow(row, false)).join("")}</tbody>`}</table>`;
    }
    case "table-row": return `<tr>${value.children.map(block).join("")}</tr>`;
    case "table-cell": return `<td>${value.content.map(inline).join("")}</td>`;
    case "math": return `<div class="hypit-document-math" data-math="block">${escapeHtml(value.value)}</div>`;
    case "footnote-definition": return `<aside id="footnote-${escapeHtml(value.label)}" class="footnote"><sup>${escapeHtml(value.label)}</sup>${value.children.map(block).join("")}</aside>`;
    case "link-definition": return "";
  }
}

export function renderDocumentHtml(blocks: readonly AuthorDocumentBlock[]): string {
  return `<article class="hypit-document">${blocks.map(block).join("")}</article>`;
}
