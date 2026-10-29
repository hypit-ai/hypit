import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets } from "@hypit/author";
import { compositionTypes } from "@hypit/composition";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";

import { hypitPackage } from "../src/activation.js";
import { visualMatteModuleRef } from "../src/index.js";

test("the official matte declaration publishes a generic VisualProcessEffect", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const decoded = await decodeMarkupDeclarations({
    name: "matte.svml",
    text: `<svml>
      <import from="@hypit/visual-matte@1" as="matte"/>
      <matte:Effect id="heads" channel="luminance" invert="true"/>
    </svml>`,
  }, {
    resolveModule: () => visualMatteModuleRef,
    syntax,
    compilers,
    sourceImports: [],
  });
  assert.deepEqual(decoded.exports.map(({ name }) => name), ["heads"]);
  assert.equal(decoded.records[0]?.type.name, compositionTypes.visualProcessEffect.name);
  assert.deepEqual((decoded.records[0]?.value as unknown as { inputs: string[] }).inputs, ["content", "matte"]);
});
