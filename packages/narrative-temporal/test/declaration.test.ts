import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets, type ResolvedAuthorSourceImport } from "@hypit/author";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";
import { narrativeTypes } from "@hypit/narrative";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { hypitPackage } from "../src/activation.js";
import { narrativeTemporalModuleRef, narrativeTemporalTypes } from "../src/index.js";

test("Narrative temporal declarations project semantic references without source-order coupling", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const facts: ResolvedAuthorSourceImport = {
    request: { from: "facts.svml", alias: "facts" },
    source: "facts.svml",
    records: [],
    exports: [
      { name: "narrative", ref: { kind: "record", id: "narrative" }, type: narrativeTypes.narrative },
      { name: "timeline", ref: { kind: "record", id: "timeline" }, type: timelineTypes.timeline },
      { name: "alignment", ref: { kind: "record", id: "alignment" }, type: narrativeTemporalTypes.narrativeAlignment },
      { name: "domain", ref: { kind: "record", id: "domain" }, type: temporalTypes.localDomain },
      { name: "window", ref: { kind: "record", id: "window" }, type: temporalTypes.window },
      { name: "selection", ref: { kind: "record", id: "selection" }, type: narrativeTypes.selection },
      { name: "moment", ref: { kind: "record", id: "moment" }, type: narrativeTypes.moment },
    ],
  };
  const decoded = await decodeMarkupDeclarations({
    name: "semantic.svml",
    text: `<svml>
      <import from="@hypit/narrative-temporal@1" as="semantic"/>
      <import source="facts.svml" as="facts"/>
      <semantic:Window id="proof" projection={story-time} during={facts.selection}/>
      <semantic:Instant id="beat" projection={story-time} at={facts.moment}/>
      <semantic:Projection id="story-time" narrative={facts.narrative} timeline={facts.timeline}>
        <semantic:Map alignment={facts.alignment} domain={facts.domain} window={facts.window}/>
      </semantic:Projection>
    </svml>`,
  }, {
    resolveModule: () => narrativeTemporalModuleRef,
    syntax,
    compilers,
    sourceImports: [facts],
  });

  assert.deepEqual(decoded.exports.map((value) => value.name), ["beat", "proof", "proof.end", "proof.start", "story-time"]);
  assert.deepEqual(decoded.components.map((component) => component.id), ["story-time", "proof.__projection", "beat.__projection"]);
  assert.equal(decoded.records.filter((record) => record.type.name === narrativeTemporalTypes.narrativeInstantSpec.name).length, 3);
});
