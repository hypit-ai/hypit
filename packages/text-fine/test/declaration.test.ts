import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets, type ResolvedAuthorSourceImport } from "@hypit/author";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";
import { mediaTypes, type FontArtifactRef } from "@hypit/media";
import { recipeType, type Recipe } from "@hypit/recipe";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { fixtureResource } from "../../../test/fixture-resource.js";
import { hypitPackage } from "../src/activation.js";
import { textFineModuleRef, textFineTypes, type TextItemSpec } from "../src/index.js";

const recipe: Recipe = {
  path: "text.poster",
  properties: { size: 52, "line-height": 1.1 },
};
const font: FontArtifactRef = {
  sources: [{ artifact: {
    kind: "blob",
    resource: fixtureResource("text-fine-declaration-font"),
    size: 1_024,
    mediaType: "font/woff2",
  } }],
  weight: 700,
  style: "normal",
};

test("Text Fine declarations preserve ordered rich content and compile independently of Markup", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const facts: ResolvedAuthorSourceImport = {
    request: { from: "facts.svml", alias: "facts" },
    source: "facts.svml",
    records: [
      { id: "recipe", type: recipeType, value: recipe },
      { id: "font", type: mediaTypes.fontArtifact, value: font },
    ],
    exports: [
      { name: "recipe", ref: { kind: "record", id: "recipe" }, type: recipeType },
      { name: "font", ref: { kind: "record", id: "font" }, type: mediaTypes.fontArtifact },
      { name: "timeline", ref: { kind: "record", id: "timeline" }, type: timelineTypes.timeline },
      { name: "window", ref: { kind: "record", id: "window" }, type: temporalTypes.window },
      { name: "frame", ref: { kind: "record", id: "frame" }, type: spatialTypes.frame },
    ],
  };
  const source = `<svml>
      <import from="@hypit/text-fine@1" as="fine"/>
      <import source="facts.svml" as="facts"/>
      <fine:Flow id="body" timeline={facts.timeline} during={facts.window}
        within={facts.frame} style={poster} inline-size="hug">
        <fine:P>
          before <fine:Span style={poster}>inside</fine:Span><fine:Break/> after
        </fine:P>
      </fine:Flow>
      <fine:Style id="poster" recipe={facts.recipe} font={facts.font}>
        <fine:Fill color="#ffffff"/>
      </fine:Style>
    </svml>`;
  const decode = (newline: "\n" | "\r\n") => decodeMarkupDeclarations({
    name: "text.svml",
    text: source.replaceAll("\n", newline),
  }, {
    resolveModule: () => textFineModuleRef,
    syntax,
    compilers,
    sourceImports: [facts],
  });
  const decoded = await decode("\n");

  assert.deepEqual(decoded.exports.map((value) => value.name), ["body.occurrence", "body.visual", "poster"]);
  const spec = decoded.records.find((record) => record.type.name === textFineTypes.itemSpec.name)?.value as TextItemSpec | undefined;
  assert.ok(spec);
  assert.deepEqual(spec.document.paragraphs[0]?.inlines.map((inline) => inline.kind === "text" ? inline.text : "<break>"), [
    "before ", "inside", "<break>", " after",
  ]);
  const flow = decoded.components.find((component) => component.id === "body");
  assert.deepEqual(flow?.inputs.style, { kind: "record", id: "poster" });
  const policy = decoded.records.find((record) => record.type.name === textFineTypes.flowPlacementPolicy.name)?.value as {
    readonly flow?: { readonly inlineSize?: string };
  } | undefined;
  assert.equal(policy?.flow?.inlineSize, "hug");

  const windows = await decode("\r\n");
  const windowsSpec = windows.records.find((record) => record.type.name === textFineTypes.itemSpec.name)?.value as TextItemSpec | undefined;
  assert.deepEqual(windowsSpec?.document, spec.document);
});
