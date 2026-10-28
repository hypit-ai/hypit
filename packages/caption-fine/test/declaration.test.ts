import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets, type ResolvedAuthorSourceImport } from "@hypit/author";
import { captionTypes } from "@hypit/caption";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";
import { mediaTypes, type FontArtifactRef } from "@hypit/media";
import { recipeType, type Recipe } from "@hypit/recipe";
import { regionEvidenceTypes } from "@hypit/region-evidence";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { fixtureResource } from "../../../test/fixture-resource.js";
import { hypitPackage } from "../src/activation.js";
import { captionFineModuleRef, captionFineTypes } from "../src/index.js";

const recipe: Recipe = {
  path: "caption.primary",
  properties: {
    x: 0.5,
    y: 0.9,
    width: 0.84,
    align: "center",
    size: 56,
    "line-height": 1,
    fill: "#FFFFFF",
    background: "#00000000",
    padding: "0",
    radius: 0,
  },
};

const font: FontArtifactRef = {
  sources: [{ artifact: {
    kind: "blob",
    resource: fixtureResource("caption-fine-declaration-font"),
    size: 1_024,
    mediaType: "font/woff2",
  } }],
  weight: 700,
  style: "normal",
};

test("Fine Caption declarations own Style, Uses and graph lowering independently of Markup", async () => {
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
      { name: "document", ref: { kind: "record", id: "document" }, type: captionTypes.document },
      { name: "timing", ref: { kind: "record", id: "timing" }, type: captionTypes.timing },
      { name: "timeline", ref: { kind: "record", id: "timeline" }, type: timelineTypes.timeline },
      { name: "frame", ref: { kind: "record", id: "frame" }, type: spatialTypes.frame },
      { name: "window", ref: { kind: "record", id: "window" }, type: temporalTypes.window },
      { name: "regions", ref: { kind: "record", id: "regions" }, type: regionEvidenceTypes.evidence },
    ],
  };
  const decoded = await decodeMarkupDeclarations({
    name: "caption.svml",
    text: `<svml>
      <import from="@hypit/caption-fine@1" as="fine"/>
      <import source="facts.svml" as="facts"/>
      <fine:Caption id="captions" document={facts.document} timing={facts.timing}
        timeline={facts.timeline} within={facts.frame} regions={facts.regions}>
        <fine:Use id="main" style={primary}/>
        <fine:Use style={primary} role="guest" during={facts.window}/>
      </fine:Caption>
      <fine:Style id="primary" recipe={facts.recipe} font={facts.font}/>
    </svml>`,
  }, {
    resolveModule: () => captionFineModuleRef,
    syntax,
    compilers,
    sourceImports: [facts],
  });

  assert.deepEqual(decoded.exports.map((value) => value.name), [
    "captions.program",
    "captions.schedule",
    "captions.visual",
    "primary",
  ]);
  assert.equal(decoded.records.some((record) => record.id === "primary" && record.type.name === captionTypes.style.name), true);
  assert.equal(decoded.records.filter((record) => record.type.name === captionTypes.filter.name).length, 2);
  const caption = decoded.components.find((component) => component.id === "captions");
  assert.equal(caption?.fragment.exports.find((output) => output.name === "schedule")?.type.name, captionFineTypes.schedule.name);
  assert.deepEqual(caption?.inputs["use-2-window"], { kind: "record", id: "window" });
  assert.deepEqual(caption?.inputs["use-1-style"], { kind: "record", id: "primary" });
});
