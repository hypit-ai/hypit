import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorDeclarationRegistry,
  declarationBody,
  declarationField,
  type AuthorDeclarationCompiler,
} from "@hypit/author";
import {
  MarkupDeclarationRegistry,
  createMarkupDeclarationAuthorFrontend,
  createMarkupDocumentFrontend,
  decodeMarkupDeclarations,
  parseMarkupDocument,
  printMarkupDocument,
} from "@hypit/markup";
import type { TypeRef } from "@hypit/protocol";
import { createResolvedClosure } from "@hypit/kernel";

const laboratory = { name: "example.document", version: "1" } as const;
const textType = { module: laboratory, name: "Text" } satisfies TypeRef;

const syntax = new MarkupDeclarationRegistry();
syntax.register({
  module: laboratory,
  declaration: "value",
  tag: "Value",
});
syntax.register({
  module: laboratory,
  declaration: "copy",
  tag: "Copy",
});

const options = {
  declarations: syntax,
  resolveModule: () => laboratory,
};

const sourceText = `<svml>
  <!-- package spelling stays authored -->
  <import from="example.document@1" as="lab"/>

  <!-- this comment belongs to the value declaration -->
  <lab:Value id='original' value="kept"/>
  <lab:Copy id="copy" source={original}/>
</svml>
`;

test("Markup Author Document round-trips comments, whitespace and quotes byte-for-byte", () => {
  const document = parseMarkupDocument({ name: "document.svml", text: sourceText });
  assert.equal(printMarkupDocument(document), sourceText);
  assert.equal(document.declarations.length, 2);
  assert.equal(document.root.children.some((node) => node.kind === "comment"), true);
  assert.equal(document.declarations[0]!.opening.attributeSyntax[0]!.valueTokenRange.start,
    sourceText.indexOf("'original'"));
});

test("opaque declaration spelling preserves package text exactly", async () => {
  const opaqueSyntax = new MarkupDeclarationRegistry();
  opaqueSyntax.register({
    module: laboratory,
    declaration: "evidence",
    tag: "Evidence",
    body: "opaque",
  });
  const declarations = new AuthorDeclarationRegistry();
  declarations.register({
    module: laboratory,
    declaration: "evidence",
    outputs: [textType],
    shape: {
      summary: "Authors one opaque evidence document.",
      fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the evidence." }],
      text: "Exact package-owned evidence text.",
    },
    bindings(declaration) {
      const id = declarationField(declaration, "id");
      if (id?.kind !== "literal") throw new Error("Evidence id must be literal.");
      return [{ name: id.value, ref: { kind: "record", id: id.value }, type: textType }];
    },
    compile({ declaration }) {
      const id = declarationField(declaration, "id");
      if (id?.kind !== "literal" || declaration.text === undefined) throw new Error("Evidence is invalid.");
      return {
        records: [{ id: id.value, type: textType, value: declaration.text, range: declaration.range }],
        components: [],
      };
    },
  });
  const text = `<svml><import from="example.document@1" as="lab"/><lab:Evidence id="raw"><HOST> &amp; exact</lab:Evidence></svml>`;
  const decoded = await decodeMarkupDeclarations({ name: "opaque.svml", text }, {
    resolveModule: () => laboratory,
    syntax: opaqueSyntax,
    compilers: declarations,
  });
  assert.equal(decoded.records[0]?.value, "<HOST> &amp; exact");

  const frontend = createMarkupDocumentFrontend({ declarations: opaqueSyntax, resolveModule: () => laboratory });
  const document = await frontend.openDocument({
    id: "opaque.svml",
    name: "opaque.svml",
    bytes: new TextEncoder().encode(text),
  });
  assert.equal(document.declarations[0]?.text, "<HOST> &amp; exact");
  const edited = await frontend.applyDocumentOperations(document, [{
    kind: "replace-text",
    declaration: document.declarations[0]!.node,
    value: `{"tag":"<x>"}`,
  }]);
  assert.equal(
    new TextDecoder().decode(edited.bytes),
    `<svml><import from="example.document@1" as="lab"/><lab:Evidence id="raw">{"tag":"<x>"}</lab:Evidence></svml>`,
  );

  const empty = await frontend.openDocument({
    id: "empty-opaque.svml",
    name: "empty-opaque.svml",
    bytes: new TextEncoder().encode(`<svml><import from="example.document@1" as="lab"/></svml>`),
  });
  const inserted = await frontend.applyDocumentOperations(empty, [{
    kind: "insert-declaration",
    container: empty.root.node,
    declaration: {
      module: laboratory,
      name: "evidence",
      fields: [{ name: "id", value: { kind: "literal", value: "inserted" } }],
      children: [],
      text: `{"tag":"<y>"}`,
    },
  }]);
  assert.equal(
    new TextDecoder().decode(inserted.bytes),
    `<svml><import from="example.document@1" as="lab"/>
<lab:Evidence id="inserted">{"tag":"<y>"}</lab:Evidence></svml>`,
  );
});

test("Markup Document applies field and structural operations without reprinting untouched text", async () => {
  const frontend = createMarkupDocumentFrontend(options);
  const source = {
    id: "document.svml",
    name: "document.svml",
    bytes: new TextEncoder().encode(sourceText),
  };
  const document = await frontend.openDocument(source);
  const [value, copy] = document.declarations;
  assert(value !== undefined && copy !== undefined);
  assert.deepEqual(document.imports, [{ kind: "module", from: "example.document@1", alias: "lab" }]);

  const edited = await frontend.applyDocumentOperations(document, [
    {
      kind: "replace-field",
      declaration: value.node,
      name: "value",
      value: { kind: "literal", value: "changed" },
    },
    {
      kind: "move-declaration",
      declaration: copy.node,
      container: document.root.node,
      before: value.node,
    },
  ]);
  const text = new TextDecoder().decode(edited.bytes);
  assert.match(text, /<lab:Copy id="copy" source=\{original\}\/>(?:\s|<!--.*?-->)*<lab:Value id='original' value="changed"\/>/su);
  assert.equal(text.includes("<!-- package spelling stays authored -->"), true);
  assert.equal(text.includes("value=\"kept\""), false);
});

test("Author Document field operations distinguish addition from replacement", async () => {
  const frontend = createMarkupDocumentFrontend(options);
  const document = await frontend.openDocument({
    id: "fields.svml",
    name: "fields.svml",
    bytes: new TextEncoder().encode(`<svml><import from="example.document@1" as="lab"/><lab:Value id="note"/></svml>`),
  });
  const declaration = document.declarations[0];
  assert(declaration !== undefined);

  await assert.rejects(
    frontend.applyDocumentOperations(document, [{
      kind: "replace-field",
      declaration: declaration.node,
      name: "value",
      value: { kind: "literal", value: "added" },
    }]),
    /has no field value/u,
  );
  const edited = await frontend.applyDocumentOperations(document, [{
    kind: "add-field",
    declaration: declaration.node,
    name: "value",
    value: { kind: "literal", value: "added" },
  }]);
  assert.equal(
    new TextDecoder().decode(edited.bytes),
    `<svml><import from="example.document@1" as="lab"/><lab:Value id="note" value="added"/></svml>`,
  );
  await assert.rejects(
    frontend.applyDocumentOperations(document, [{
      kind: "add-field",
      declaration: declaration.node,
      name: "id",
      value: { kind: "literal", value: "other" },
    }]),
    /already has field id/u,
  );
});

test("Markup rejects ambiguous declaration spellings instead of choosing by import order", async () => {
  const other = { name: "example.other", version: "1" } as const;
  const colliding = new MarkupDeclarationRegistry();
  colliding.register({ module: laboratory, declaration: "value", tag: "Value" });
  colliding.register({ module: other, declaration: "other-value", tag: "Value" });
  const frontend = createMarkupDocumentFrontend({
    declarations: colliding,
    resolveModule(request) {
      return request.from === "example.other@1" ? other : laboratory;
    },
  });
  const unit = (text: string) => ({
    id: "ambiguous.svml",
    name: "ambiguous.svml",
    bytes: new TextEncoder().encode(text),
  });

  await assert.rejects(frontend.openDocument(unit(`<svml>
    <import from="example.document@1"/>
    <import from="example.other@1"/>
    <Value id="value"/>
  </svml>`)), (error: unknown) => error instanceof Error
    && error.message.includes("<Value> is declared by both"));
  await assert.rejects(frontend.openDocument(unit(`<svml>
    <import from="example.document@1" as="a"/>
    <import from="example.document@1" as="b"/>
  </svml>`)), (error: unknown) => error instanceof Error
    && error.message.includes("is imported more than once"));
});

test("Markup Document can add an import and insert a declaration in one source-neutral batch", async () => {
  const emptyText = "<svml>\n</svml>\n";
  const frontend = createMarkupDocumentFrontend(options);
  const document = await frontend.openDocument({
    id: "empty.svml",
    name: "empty.svml",
    bytes: new TextEncoder().encode(emptyText),
  });
  const edited = await frontend.applyDocumentOperations(document, [
    { kind: "add-import", value: { kind: "module", from: "example.document@1", alias: "lab" } },
    {
      kind: "insert-declaration",
      container: document.root.node,
      declaration: {
        module: laboratory,
        name: "value",
        fields: [
          { name: "id", value: { kind: "literal", value: "new" } },
          { name: "value", value: { kind: "literal", value: "hello" } },
        ],
        children: [],
      },
    },
  ]);
  assert.equal(new TextDecoder().decode(edited.bytes), `<svml>\n
  <import from="example.document@1" as="lab"/>
  <lab:Value id="new" value="hello"/></svml>\n`);
});

test("Markup Document deletes declaration-owned trivia and removes one exact import", async () => {
  const frontend = createMarkupDocumentFrontend(options);
  const document = await frontend.openDocument({
    id: "delete.svml",
    name: "delete.svml",
    bytes: new TextEncoder().encode(sourceText),
  });
  const value = document.declarations[0];
  assert(value !== undefined);
  const edited = await frontend.applyDocumentOperations(document, [
    { kind: "delete-declaration", declaration: value.node },
    { kind: "remove-import", value: { kind: "module", from: "example.document@1", alias: "lab" } },
  ]);
  const text = new TextDecoder().decode(edited.bytes);
  assert.equal(text.includes("<lab:Value"), false);
  assert.equal(text.includes("this comment belongs to the value declaration"), false);
  assert.equal(text.includes("<import"), false);
  assert.equal(text.includes("<lab:Copy"), true);
});

test("Markup Document removes optional fields and edits structured text locally", async () => {
  const text = `<svml><import from="example.document@1" as="lab"/><lab:Value id="note" value="optional">Old &amp; text</lab:Value></svml>`;
  const frontend = createMarkupDocumentFrontend(options);
  const document = await frontend.openDocument({
    id: "text.svml",
    name: "text.svml",
    bytes: new TextEncoder().encode(text),
  });
  const declaration = document.declarations[0];
  assert(declaration !== undefined);
  assert.equal(declaration.text, "Old & text");
  const edited = await frontend.applyDocumentOperations(document, [
    { kind: "remove-field", declaration: declaration.node, name: "value" },
    { kind: "replace-text", declaration: declaration.node, value: "New <text>" },
  ]);
  assert.equal(
    new TextDecoder().decode(edited.bytes),
    `<svml><import from="example.document@1" as="lab"/><lab:Value id="note" >New &lt;text&gt;</lab:Value></svml>`,
  );
});

test("Markup declarations lower through the syntax-neutral two-phase compiler", async () => {
  const declarations = new AuthorDeclarationRegistry();
  const valueCompiler: AuthorDeclarationCompiler = {
    module: laboratory,
    declaration: "value",
    outputs: [textType],
    shape: {
      summary: "Authors one text value.",
      fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names the value." },
        { name: "value", kind: "literal", required: true, summary: "Provides the text." },
      ],
    },
    bindings(declaration) {
      const id = declarationField(declaration, "id");
      if (id?.kind !== "literal") throw new Error("id must be literal");
      return [{ name: id.value, ref: { kind: "record", id: id.value }, type: textType }];
    },
    compile({ declaration }) {
      const id = declarationField(declaration, "id");
      const value = declarationField(declaration, "value");
      if (id?.kind !== "literal" || value?.kind !== "literal") throw new Error("invalid value declaration");
      return { records: [{ id: id.value, type: textType, value: value.value, range: declaration.range }], components: [] };
    },
  };
  const copyCompiler: AuthorDeclarationCompiler = {
    module: laboratory,
    declaration: "copy",
    outputs: [textType],
    shape: {
      summary: "Copies one authored text value.",
      fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names the copy." },
        { name: "source", kind: "reference", required: true, accepts: [textType], summary: "Chooses the source." },
      ],
    },
    bindings(declaration) {
      const id = declarationField(declaration, "id");
      if (id?.kind !== "literal") throw new Error("id must be literal");
      return [{ name: id.value, ref: { kind: "record", id: id.value }, type: textType }];
    },
    async compile({ declaration, resolveReference }) {
      const id = declarationField(declaration, "id");
      const source = declarationField(declaration, "source");
      if (id?.kind !== "literal" || source?.kind !== "reference") throw new Error("invalid copy declaration");
      const resolved = await resolveReference(source.path);
      if (resolved?.record === undefined) throw new Error("copy source is not authored data");
      return { records: [{ id: id.value, type: textType, value: resolved.record.value, range: declaration.range }], components: [] };
    },
  };
  declarations.register(valueCompiler);
  declarations.register(copyCompiler);

  const decoded = await decodeMarkupDeclarations({ name: "forward.svml", text: `<svml>
    <import from="example.document@1" as="lab"/>
    <lab:Copy id="copy" source={original}/>
    <lab:Value id="original" value="kept"/>
  </svml>` }, { resolveModule: options.resolveModule, syntax, compilers: declarations });

  assert.deepEqual(decoded.records.map((record) => [record.id, record.value]), [
    ["original", "kept"],
    ["copy", "kept"],
  ]);
});

test("structured declarations preserve text and child order without exposing Markup nodes", async () => {
  const richSyntax = new MarkupDeclarationRegistry();
  richSyntax.register({ module: laboratory, declaration: "rich", tag: "Rich" });
  const declarations = new AuthorDeclarationRegistry();
  declarations.register({
    module: laboratory,
    declaration: "rich",
    outputs: [textType],
    shape: {
      summary: "Authors ordered rich text.",
      fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the text." }],
      children: [{
        name: "P",
        cardinality: "one",
        summary: "One paragraph.",
        fields: [],
        text: "Direct paragraph text.",
        children: [{ name: "Span", cardinality: "many", summary: "One inline span.", fields: [], text: "Span text." }],
      }],
    },
    bindings(declaration) {
      const id = declarationField(declaration, "id");
      if (id?.kind !== "literal") throw new Error("Rich id must be literal.");
      return [{ name: id.value, ref: { kind: "record", id: id.value }, type: textType }];
    },
    compile({ declaration }) {
      const id = declarationField(declaration, "id");
      if (id?.kind !== "literal") throw new Error("Rich id must be literal.");
      const paragraph = declaration.children[0]!;
      const value = declarationBody(paragraph).map((part) => part.kind === "text"
        ? part.value
        : `[${declarationBody(part.child).map((nested) => nested.kind === "text" ? nested.value : "").join("")}]`).join("");
      return { records: [{ id: id.value, type: textType, value, range: declaration.range }], components: [] };
    },
  });

  const decoded = await decodeMarkupDeclarations({ name: "rich.svml", text: `<svml>
    <import from="example.document@1" as="lab"/>
    <lab:Rich id="line"><lab:P>before <!-- spelling only --><lab:Span>inside</lab:Span> after</lab:P></lab:Rich>
  </svml>` }, { resolveModule: options.resolveModule, syntax: richSyntax, compilers: declarations });

  assert.equal(decoded.records[0]?.value, "before [inside] after");
});

test("the declaration-only Markup Frontend discovers and decodes a complete Source", async () => {
  const declarations = new AuthorDeclarationRegistry();
  declarations.register({
    module: laboratory,
    declaration: "value",
    outputs: [textType],
    shape: {
      summary: "Authors one text value.",
      fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names the value." },
        { name: "value", kind: "literal", required: true, summary: "Provides the text." },
      ],
    },
    bindings(declaration) {
      const id = declarationField(declaration, "id");
      if (id?.kind !== "literal") throw new Error("id must be literal");
      return [{ name: id.value, ref: { kind: "record", id: id.value }, type: textType }];
    },
    compile({ declaration }) {
      const id = declarationField(declaration, "id");
      const value = declarationField(declaration, "value");
      if (id?.kind !== "literal" || value?.kind !== "literal") throw new Error("invalid value declaration");
      return { records: [{ id: id.value, type: textType, value: value.value, range: declaration.range }], components: [] };
    },
  });
  const frontend = createMarkupDeclarationAuthorFrontend({
    resolveModule: () => laboratory,
    syntax,
    compilers: declarations,
  });
  const text = `<svml><import from="example.document@1" as="lab"/><lab:Value id="answer" value="42"/></svml>`;
  const unit = { id: "/project/main.svml", name: "main.svml", bytes: new TextEncoder().encode(text) };

  assert.deepEqual(await frontend.discover(unit), { modules: ["example.document@1"], sources: [] });
  const decoded = await frontend.decode(unit, {
    closure: createResolvedClosure([{
      format: "hypit.module@1",
      name: laboratory.name,
      version: laboratory.version,
      dependencies: [],
      types: [textType.name],
      capabilities: [],
      producers: [],
    }]),
    imports: [],
    resolveAsset: () => { throw new Error("unused"); },
  });
  assert.deepEqual(decoded.records, [{ id: "answer", type: textType, value: "42" }]);
  assert.deepEqual(decoded.exports.map((item) => item.name), ["answer"]);
});
