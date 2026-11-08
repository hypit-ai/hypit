import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthorStructureDeclarationNode,
  AuthorStructureFieldNode,
} from "@hypit/author";

import {
  declarationsFromSvmlDocument,
  parseSvmlDocument,
  printSvmlDocument,
  svmlStructureFrontend,
} from "../src/index.js";
import {
  planAddCanvasViewItem,
  projectCanvasView,
} from "../../canvas-view/src/index.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const sourceText = `// Packages stay independent of the SVML grammar.
module media from "@hypit/media@1"
module image from "@example/image@1"
module canvas from "@hypit/canvas-view@1"

media.Asset "product" {
  from: "./product.png"
}

image.Generate "hero" {
  prompt: "A presenter holding the product"
  reference: @product
}

canvas.View "creation" {
  item "hero" {
    subject: @hero
    layout: { x: 80, y: 120 }
  }
}
`;

function source(text = sourceText) {
  return { id: "/project/main.svml", name: "main.svml", bytes: encoder.encode(text) };
}

function declaration(
  document: Awaited<ReturnType<typeof svmlStructureFrontend.openStructure>>,
  label: string,
): AuthorStructureDeclarationNode {
  const value = document.nodes.find((node): node is AuthorStructureDeclarationNode =>
    node.kind === "declaration" && node.label === label);
  assert(value !== undefined);
  return value;
}

test("SVML Block parses without package grammar and prints untouched bytes exactly", () => {
  const parsed = parseSvmlDocument(source());
  assert.equal(printSvmlDocument(parsed), sourceText);
  assert.equal(parsed.declarations.length, 3);
  assert.deepEqual(parsed.declarations.map((item) => item.label), ["product", "hero", "creation"]);

  const authored = declarationsFromSvmlDocument(parsed);
  assert.equal(authored[1]?.module.name, "@example/image");
  assert.equal(authored[1]?.label, "hero");
  assert.deepEqual(authored[2]?.children.map((child) => [child.name, child.label]), [["item", "hero"]]);
});

test("raw literal replacement remains parseable and locally indented", async () => {
  const text = `module note from "@example/note@1"

note.Text "brief" {
  value: <<PROMPT
first line
second line
  PROMPT
}
`;
  const document = await svmlStructureFrontend.openStructure(source(text));
  const brief = declaration(document, "brief");
  const valueField = document.containers.find((candidate) => candidate.container === brief.fields)!.items
    .map((id) => document.nodes.find((candidate) => candidate.node === id))
    .find((item): item is AuthorStructureFieldNode => item?.kind === "field" && item.name === "value")!;
  const edited = await svmlStructureFrontend.applyStructureOperations(document, [{
    kind: "replace",
    node: valueField.value,
    value: { kind: "literal", value: "updated\nbody\n", style: "raw" },
  }]);
  const candidate = decoder.decode(edited.bytes);
  assert.match(candidate, /value: <<SVML\nupdated\nbody\n  SVML/u);
  assert.equal(printSvmlDocument(parseSvmlDocument(edited)), candidate);
});

test("Canvas Add Image writes an independent root subject and an owned View item atomically", async () => {
  const document = await svmlStructureFrontend.openStructure(source());
  const canvas = declaration(document, "creation");
  const edited = await svmlStructureFrontend.applyStructureOperations(document, [
    {
      kind: "insert",
      container: document.declarations,
      value: {
        kind: "declaration",
        module: { name: "@hypit/media", version: "1" },
        name: "Asset",
        label: "detail",
        fields: [{
          kind: "field",
          name: "from",
          value: { kind: "literal", value: "./detail.png", style: "quoted" },
        }],
        children: [],
      },
    },
    ...planAddCanvasViewItem(document, canvas.node, { id: "detail", subject: "detail", x: 360, y: 120 }),
  ]);
  const text = decoder.decode(edited.bytes);
  const reparsed = parseSvmlDocument(edited);
  assert.equal(reparsed.declarations.some((item) => item.moduleAlias === "media" && item.label === "detail"), true);
  const canvasSyntax = reparsed.declarations.find((item) => item.label === "creation");
  assert.equal(canvasSyntax?.children.some((item) => item.label === "detail"), true);
  assert.match(text, /media\.Asset "detail" \{\n  from: "\.\/detail\.png"\n\}/u);
  assert.match(text, /item "detail" \{\n    subject: @detail/u);

  const reopened = await svmlStructureFrontend.openStructure(edited);
  const projectedCanvas = projectCanvasView(reopened, declaration(reopened, "creation").node);
  assert.deepEqual(projectedCanvas.items.map((item) => [item.id, item.subject, item.x, item.y]), [
    ["hero", "hero", 80, 120],
    ["detail", "detail", 360, 120],
  ]);
});
