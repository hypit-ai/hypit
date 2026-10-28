import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets } from "@hypit/author";
import { HTML_ADJUSTMENT_FORMAT, readHtmlAdjustment } from "@hypit/html-program";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";

import { hypitPackage } from "../src/activation.js";
import { visualTreatmentModuleRef } from "../src/index.js";

test("all official treatments compile through the public Markup surface", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const decoded = await decodeMarkupDeclarations({
    name: "treatments.svml",
    text: `<svml>
      <import from="@hypit/visual-treatment@1" as="treatment"/>
      <treatment:Transform id="move" x="12" scale="1.1" rotate="-2"/>
      <treatment:Opacity id="fade">
        <treatment:Keyframe at="start" value="0" easing="ease-out"/>
        <treatment:Keyframe at="end" value="1"/>
      </treatment:Opacity>
      <treatment:Blur id="soft" radius="8"/>
      <treatment:Color id="grade" contrast="1.1" saturation="0.9" hue="-2"/>
    </svml>`,
  }, {
    resolveModule: () => visualTreatmentModuleRef,
    syntax,
    compilers,
    sourceImports: [],
  });

  assert.deepEqual(decoded.exports.map(({ name }) => name), ["fade", "grade", "move", "soft"]);
  assert.equal(decoded.records.length, 4);
  assert.equal(decoded.records.every(({ value }) => {
    const program = value as unknown as { readonly format?: string };
    return program.format === HTML_ADJUSTMENT_FORMAT;
  }), true);
  const fade = decoded.records.find(({ id }) => id === "fade");
  assert.deepEqual(readHtmlAdjustment(fade!.value as never).keyframes.map(({ at, opacity }) => ({ at, opacity })), [
    { at: 0, opacity: 0 }, { at: 1, opacity: 1 },
  ]);
});

test("animated declarations do not mix static and keyframed authoring", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  await assert.rejects(() => decodeMarkupDeclarations({
    name: "invalid.svml",
    text: `<svml>
      <import from="@hypit/visual-treatment@1" as="treatment"/>
      <treatment:Blur id="soft" radius="8">
        <treatment:Keyframe at="start" radius="0"/>
        <treatment:Keyframe at="end" radius="8"/>
      </treatment:Blur>
    </svml>`,
  }, { resolveModule: () => visualTreatmentModuleRef, syntax, compilers, sourceImports: [] }),
  /cannot combine top-level parameters with Keyframe children/u);
});
