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

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const sourceText = `// Packages stay independent of the SVML grammar.
module media from "@hypit/media@1"
module image from "@example/image@1"

media.Asset "product" {
  from: "./product.png"
}

image.Generate "hero" {
  prompt: "A presenter holding the product"
  reference: @product
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
  assert.equal(parsed.declarations.length, 2);
  assert.deepEqual(parsed.declarations.map((item) => item.label), ["product", "hero"]);

  const authored = declarationsFromSvmlDocument(parsed);
  assert.equal(authored[1]?.module.name, "@example/image");
  assert.equal(authored[1]?.label, "hero");
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
