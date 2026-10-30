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
    exports: [
      { name: "canvas", ref: { kind: "record", id: "canvas" }, type: spatialTypes.canvas },
      { name: "timeline", ref: { kind: "record", id: "timeline" }, type: timelineTypes.timeline },
      { name: "visual", ref: { kind: "record", id: "visual" }, type: compositionTypes.visualTrack },
      { name: "audio", ref: { kind: "record", id: "audio" }, type: compositionTypes.audioTrack },
      { name: "matte", ref: { kind: "record", id: "matte" }, type: compositionTypes.visualProcessEffect },
      { name: "appearance", ref: { kind: "record", id: "appearance" }, type: recipeType },
    ],
    records: [{
      id: "appearance",
      type: recipeType,
      value: { path: "film", properties: { background: "#09090B" } },
    }, {
      id: "matte",
      type: compositionTypes.visualProcessEffect,
      value: { inputs: ["content", "matte"], program: { format: "example.matte@1", payload: {}, artifacts: [] } },
    }],
  };
  const text = `<svml>
  <import from="@hypit/film@1" as="film"/>
  <import source="facts.svml" as="facts"/>
  <film:Film id="main" canvas={facts.canvas} timeline={facts.timeline} appearance={facts.appearance}>
    <film:Stack id="foreground">
      <film:Stack id="titles"><film:Track id="title" source={facts.visual}/></film:Stack>
    </film:Stack>
    <film:Process id="masked" effect={facts.matte}>
      <film:Input name="content"><film:Track id="content" source={facts.visual}/></film:Input>
      <film:Input name="matte"><film:Track id="matte" source={facts.visual}/></film:Input>
    </film:Process>
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
    }] }, {
      kind: "process", id: "masked",
      inputs: [
        { name: "content", members: [{ kind: "track", id: "content", slot: 0 }] },
        { name: "matte", members: [{ kind: "track", id: "matte", slot: 0 }] },
      ],
      effect: { inputs: ["content", "matte"], program: { format: "example.matte@1", payload: {}, artifacts: [] } },
    }] },
    audio: [1],
  });
  assert.equal(decoded.components[0]?.fragment.inputs.filter((input) => input.name.startsWith("track-")).length, 2);
});
