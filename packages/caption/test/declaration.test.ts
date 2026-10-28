import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorDeclarationRegistry,
  compileAuthorDeclarations,
  installAuthorDeclarationFacets,
  type AuthorDeclaration,
} from "@hypit/author";
import {
  MarkupDeclarationRegistry,
  decodeMarkupDeclarations,
  installMarkupDeclarationFacets,
} from "@hypit/markup";

import { hypitPackage } from "../src/activation.js";
import { captionModuleRef } from "../src/index.js";

const compilers = new AuthorDeclarationRegistry();
const syntax = new MarkupDeclarationRegistry();
installAuthorDeclarationFacets(hypitPackage.facets, compilers);
installMarkupDeclarationFacets(hypitPackage.facets, syntax);

const direct: AuthorDeclaration = {
  module: captionModuleRef,
  name: "hidden",
  fields: [{ name: "id", value: { kind: "literal", value: "silent" } }],
  children: [],
  range: { start: 0, end: 1 },
};

test("Caption Hidden direct and Markup declarations produce the same Style", async () => {
  const directResult = await compileAuthorDeclarations({
    sourceName: "direct",
    declarations: [direct],
    registry: compilers,
    resolveAsset() { throw new Error("Caption Hidden does not resolve assets."); },
  });
  const markupResult = await decodeMarkupDeclarations({
    name: "caption.svml",
    text: `<svml><import from="@hypit/caption@1" as="caption"/><caption:Hidden id="silent"/></svml>`,
  }, {
    resolveModule: () => captionModuleRef,
    syntax,
    compilers,
  });

  assert.deepEqual(markupResult.records, directResult.records);
  assert.deepEqual(markupResult.exports, directResult.exports);
  assert.deepEqual(markupResult.components, []);
});
