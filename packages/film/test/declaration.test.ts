import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets, type ResolvedAuthorSourceImport } from "@hypit/author";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";
import { compositionTypes } from "@hypit/composition";
import { spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/recipe";
import { timelineTypes } from "@hypit/timeline";

import { hypitPackage } from "../src/activation.js";
import { filmModuleRef, filmTypes } from "../src/index.js";

test("Film's package-owned declaration compiles recursive scopes independently of Markup", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const facts: ResolvedAuthorSourceImport = {
    request: { from: "facts.svml", alias: "facts" },
    source: "facts.svml",
    records: [{
      id: "appearance",
      type: recipeType,
      value: { path: "film", properties: { background: "#09090B" } },
    }],
    exports: [
      { name: "canvas", ref: { kind: "record", id: "canvas" }, type: spatialTypes.canvas },
      { name: "timeline", ref: { kind: "record", id: "timeline" }, type: timelineTypes.timeline },
      { name: "visual", ref: { kind: "record", id: "visual" }, type: compositionTypes.visualTrack },
      { name: "audio", ref: { kind: "record", id: "audio" }, type: compositionTypes.audioTrack },
      { name: "appearance", ref: { kind: "record", id: "appearance" }, type: recipeType },
    ],
  };
  const text = `<svml>
  <import from="@hypit/film@1" as="film"/>
  <import source="facts.svml" as="facts"/>
  <film:Film id="main" canvas={facts.canvas} timeline={facts.timeline} appearance={facts.appearance}>
    <film:Stack id="foreground">
      <film:Stack id="titles"><film:Track id="title" source={facts.visual}/></film:Stack>
    </film:Stack>
    <film:Track source={facts.audio}/>
  </film:Film>
</svml>`;
  const decoded = await decodeMarkupDeclarations({ name: "film.svml", text }, {
    resolveModule: () => filmModuleRef,
    syntax,
    compilers,
    sourceImports: [facts],
  });

  assert.deepEqual(decoded.exports.map((value) => value.name), ["main.composition"]);
  assert.deepEqual(decoded.records.find((record) => record.type.name === filmTypes.program.name)?.value, {
    id: "main",
    clearColor: "#09090B",
    visual: { members: [{ kind: "stack", id: "foreground", members: [{
      kind: "stack", id: "titles", members: [{ kind: "track", id: "title", slot: 0 }],
    }] }] },
    audio: [1],
  });
  assert.equal(decoded.components[0]?.fragment.inputs.filter((input) => input.name.startsWith("track-")).length, 2);
});
