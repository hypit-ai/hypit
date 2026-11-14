import assert from "node:assert/strict";
import test from "node:test";

import { resolveSelfDescribedTextSource } from "@hypit/generation-authoring/source/text";

import {
  documentFrontend,
  parseDocument,
  printDocument,
  renderDocumentHtml,
} from "../src/index.js";

const completeMarkdown = `# 一级标题

######### 九级标题

正文有 **粗体**、*斜体*、~下划线~、~~删除线~~、\`代码\`、[链接](https://hypit.ai) 和 ![图片](./cover.png)。

> 引用
>
> 第二段

- 无序项
  - 嵌套项
- [x] 已完成
- [ ] 未完成

3. 第三项
4. 第四项

| 左 | 中 | 右 |
| :--- | :---: | ---: |
| A | B | C |

\`\`\`ts title="demo"
const answer = 42;
\`\`\`

行内公式 $x + y$。

$$
x^2 + y^2
$$

---
`;

test("Document Markdown covers the public Feishu-style writing surface", () => {
  const parsed = parseDocument(completeMarkdown);
  assert.equal(printDocument(parsed), completeMarkdown);

  const headings = parsed.blocks.filter((block) => block.kind === "heading");
  assert.deepEqual(headings.map((heading) => heading.level), [1, 9]);
  const paragraph = parsed.blocks.find((block) => block.kind === "paragraph");
  assert(paragraph?.kind === "paragraph");
  const marked = paragraph.content.filter((inline) => inline.kind === "text");
  assert.equal(marked.some((inline) => inline.marks.includes("bold")), true);
  assert.equal(marked.some((inline) => inline.marks.includes("italic")), true);
  assert.equal(marked.some((inline) => inline.marks.includes("underline")), true);
  assert.equal(marked.some((inline) => inline.marks.includes("strikethrough")), true);

  const lists = parsed.blocks.filter((block) => block.kind === "list");
  assert.equal(lists.length, 2);
  assert.equal(lists[0]?.kind === "list" && lists[0].children.some((item) =>
    item.kind === "list-item" && item.checked === true), true);
  assert.equal(lists[1]?.kind === "list" && lists[1].start, 3);

  const table = parsed.blocks.find((block) => block.kind === "table");
  assert(table?.kind === "table");
  assert.deepEqual(table.align, ["left", "center", "right"]);
  assert.equal(parsed.blocks.some((block) => block.kind === "code" && block.language === "ts"), true);
  assert.equal(parsed.blocks.some((block) => block.kind === "math"), true);
  assert.equal(parsed.blocks.some((block) => block.kind === "divider"), true);
});

test("one component-free SVML file projects to document blocks and an empty AuthorGraph input", async () => {
  const resolved = resolveSelfDescribedTextSource({
    id: "/project/notes.svml",
    name: "notes.svml",
    text: `<?svml using="@hypit/document"?>\n${completeMarkdown}`,
  });
  assert.equal(resolved.frontend, documentFrontend.id);
  const frontend = documentFrontend.document;
  assert(frontend !== undefined);
  const document = await frontend.openDocument(resolved.unit);
  assert.equal(document.root.blocks.length, parseDocument(completeMarkdown).blocks.length);
  assert.deepEqual(document.declarations, []);
  assert.deepEqual(document.imports, []);

  const decoded = await documentFrontend.decode(resolved.unit, undefined as never);
  assert.deepEqual(decoded, { records: [], components: [], exports: [] });
});

test("block edits change only addressed Markdown ranges", async () => {
  const resolved = resolveSelfDescribedTextSource({
    id: "/project/edit.svml",
    name: "edit.svml",
    text: `<?svml using="@hypit/document"?>\n# Original\n\nKeep **this spelling**.\n`,
  });
  const frontend = documentFrontend.document;
  assert(frontend !== undefined);
  const document = await frontend.openDocument(resolved.unit);
  const [heading, paragraph] = document.root.blocks;
  assert(heading !== undefined && paragraph !== undefined);
  const edited = await frontend.applyDocumentOperations(document, [
    {
      kind: "replace-block",
      block: heading.node,
      value: { kind: "heading", level: 2, content: [{ kind: "text", value: "Revised", marks: [] }] },
    },
    {
      kind: "insert-block",
      container: document.root.node,
      before: paragraph.node,
      block: { kind: "paragraph", content: [{ kind: "text", value: "Inserted", marks: ["italic"] }] },
    },
  ]);
  const text = new TextDecoder().decode(edited.bytes);
  assert.match(text, /## Revised\n\n\*Inserted\*\n\nKeep \*\*this spelling\*\*\./u);
  assert.match(text, /^ +\n## Revised/u);

  const reopened = await frontend.openDocument(edited);
  const inserted = reopened.root.blocks.find((block) =>
    block.kind === "paragraph" && block.content.some((inline) => inline.kind === "text" && inline.value === "Inserted"));
  assert(inserted !== undefined);
  const deleted = await frontend.applyDocumentOperations(reopened, [{ kind: "delete-block", block: inserted.node }]);
  assert.equal(new TextDecoder().decode(deleted.bytes).includes("Inserted"), false);

  const withoutInserted = await frontend.openDocument(deleted);
  const [revisedHeading, keptParagraph] = withoutInserted.root.blocks;
  assert(revisedHeading !== undefined && keptParagraph !== undefined);
  const moved = await frontend.applyDocumentOperations(withoutInserted, [{
    kind: "move-block",
    block: keptParagraph.node,
    container: withoutInserted.root.node,
    before: revisedHeading.node,
  }]);
  assert.match(new TextDecoder().decode(moved.bytes), /^ +\nKeep \*\*this spelling\*\*\.\n\n## Revised/u);
});

test("HTML projection is semantic and does not admit executable Markdown", () => {
  assert.throws(
    () => renderDocumentHtml(parseDocument(`####### Deep\n\n| Head |\n| --- |\n| Cell |\n\n[unsafe](javascript:alert) <script>`).blocks),
    /raw HTML/u,
  );

  const safe = parseDocument(`####### Deep\n\n| Head |\n| --- |\n| Cell |\n\n[unsafe](javascript:alert)`);
  const html = renderDocumentHtml(safe.blocks);
  assert.match(html, /<h6 role="heading" aria-level="7" data-heading-level="7">Deep<\/h6>/u);
  assert.match(html, /<thead><tr><th>Head<\/th><\/tr><\/thead>/u);
  assert.match(html, /<tbody><tr><td>Cell<\/td><\/tr><\/tbody>/u);
  assert.match(html, /<a href="#">unsafe<\/a>/u);
  assert.equal(html.includes("javascript:"), false);
});

test("raw HTML is rejected instead of becoming an unowned interactive escape hatch", () => {
  assert.throws(() => parseDocument("before <button>run</button> after"), /raw HTML/u);
});

test("Feishu underline remains distinct from strikethrough and escaped tildes", () => {
  const document = parseDocument("~underline~ ~~strike~~ \\~literal\\~");
  const paragraph = document.blocks[0];
  assert(paragraph?.kind === "paragraph");
  const texts = paragraph.content.filter((inline) => inline.kind === "text");
  assert.equal(texts.some((inline) => inline.value === "underline" && inline.marks.includes("underline")), true);
  assert.equal(texts.some((inline) => inline.value === "strike" && inline.marks.includes("strikethrough")), true);
  assert.equal(texts.some((inline) => inline.value.includes("literal") && inline.marks.length === 0), true);
});
