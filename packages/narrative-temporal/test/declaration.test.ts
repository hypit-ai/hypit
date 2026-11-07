import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets, type ResolvedAuthorSourceImport } from "@hypit/author";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";
import { narrativeTypes } from "@hypit/narrative";
import { temporalTypes } from "@hypit/temporal";

import { hypitPackage } from "../src/activation.js";
import { narrativeTemporalModuleRef, narrativeTemporalTypes } from "../src/index.js";

test("Narrative Timing aggregates exact local Alignments without a global Timeline", async () => {
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
      { name: "alignment", ref: { kind: "record", id: "alignment" }, type: narrativeTemporalTypes.narrativeAlignment },
      { name: "domain", ref: { kind: "record", id: "domain" }, type: temporalTypes.localDomain },
    ],
  };
  const decoded = await decodeMarkupDeclarations({
    name: "semantic.svml",
    text: `<svml>
      <import from="@hypit/narrative-temporal@1" as="semantic"/>
      <import source="facts.svml" as="facts"/>
      <semantic:Timing id="story-time" narrative={facts.narrative} domain={facts.domain}>
        <semantic:Alignment value={facts.alignment}/>
      </semantic:Timing>
    </svml>`,
  }, {
    resolveModule: () => narrativeTemporalModuleRef,
    syntax,
    compilers,
    sourceImports: [facts],
  });

  assert.deepEqual(decoded.exports.map((value) => value.name), ["story-time"]);
  assert.deepEqual(decoded.components.map((component) => component.id), ["story-time"]);
  assert.equal(decoded.records.filter((record) => record.type.name === narrativeTemporalTypes.narrativeTimingHeader.name).length, 1);
});
