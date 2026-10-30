import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets, type ResolvedAuthorSourceImport } from "@hypit/author";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";
import { compositionTypes } from "@hypit/composition";

import { hypitPackage } from "../src/activation.js";
import { htmlDocumentModuleRef } from "../src/index.js";

test("HTML Document declaration derives its clock from Composition", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const facts: ResolvedAuthorSourceImport = {
    request: { from: "facts.svml", alias: "facts" },
    source: "facts.svml",
    records: [],
    exports: [
      { name: "composition", ref: { kind: "record", id: "composition" }, type: compositionTypes.composition },
    ],
  };
  const decoded = await decodeMarkupDeclarations({
    name: "document.svml",
    text: `<svml>
      <import from="@hypit/html-document@1" as="page"/>
      <import source="facts.svml" as="facts"/>
      <page:Document id="preview" composition={facts.composition}/>
    </svml>`,
  }, {
    resolveModule: () => htmlDocumentModuleRef,
    syntax,
    compilers,
    sourceImports: [facts],
  });

  assert.deepEqual(decoded.exports.map((value) => value.name), ["preview.document"]);
  assert.deepEqual(decoded.components[0]?.inputs, {
    composition: { kind: "record", id: "composition" },
  });
});
