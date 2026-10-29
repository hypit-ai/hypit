import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets } from "@hypit/author";
import { HTML_VISUAL_FORMAT } from "@hypit/html-program";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";

import { hypitPackage } from "../src/activation.js";
import { visualTransitionModuleRef } from "../src/index.js";

test("all official transition declarations compile through the public Markup surface", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const decoded = await decodeMarkupDeclarations({
    name: "transitions.svml",
    text: `<svml>
      <import from="@hypit/visual-transition@1" as="transition"/>
      <transition:CrossDissolve id="dissolve" easing="ease-in-out"/>
      <transition:DipToColor id="dip" color="#ffffff"/>
      <transition:Push id="push" direction="left"/>
      <transition:Slide id="slide" direction="up"/>
      <transition:LinearWipe id="wipe" direction="right"/>
      <transition:Iris id="iris" shape="diamond"/>
      <transition:ZoomDissolve id="zoom" strength="0.2"/>
      <transition:BlurDissolve id="blur" radius="24"/>
    </svml>`,
  }, {
    resolveModule: () => visualTransitionModuleRef,
    syntax,
    compilers,
    sourceImports: [],
  });

  assert.deepEqual(decoded.exports.map(({ name }) => name), [
    "blur", "dip", "dissolve", "iris", "push", "slide", "wipe", "zoom",
  ]);
  assert.equal(decoded.records.length, 8);
  assert.equal(decoded.records.every(({ value }) => {
    const effect = value as unknown as { readonly inputs?: readonly string[]; readonly program?: { readonly format?: string } };
    return effect.inputs?.join(",") === "outgoing,incoming" && effect.program?.format === HTML_VISUAL_FORMAT;
  }), true);
});
