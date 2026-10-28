import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets, type ResolvedAuthorSourceImport } from "@hypit/author";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";
import { compositionTypes } from "@hypit/composition";
import { timelineTypes } from "@hypit/timeline";

import { hypitPackage } from "../src/activation.js";
import { audioMixModuleRef, audioMixTypes } from "../src/index.js";

test("Audio Mix declarations resolve their graph by reference rather than source order", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const facts: ResolvedAuthorSourceImport = {
    request: { from: "facts.svml", alias: "facts" },
    source: "facts.svml",
    records: [],
    exports: [{ name: "timeline", ref: { kind: "record", id: "film.timeline" }, type: timelineTypes.timeline }, {
      name: "voice", ref: { kind: "record", id: "voice.audio" }, type: compositionTypes.audioTrack,
    }],
  };
  const text = `<svml>
  <import from="@hypit/audio-mix@1" as="mix"/>
  <import source="facts.svml" as="facts"/>
  <mix:Track id="master" timeline={facts.timeline}>
    <mix:Input id="dialogue" source={dialogue.audio}/>
  </mix:Track>
  <mix:Track id="dialogue" timeline={facts.timeline}>
    <mix:Input id="voice" source={facts.voice} gain="0.8"/>
  </mix:Track>
</svml>`;
  const voiceInput = text.indexOf('<mix:Input id="voice"');
  const decoded = await decodeMarkupDeclarations({ name: "mix.svml", text }, {
    resolveModule: () => audioMixModuleRef,
    syntax,
    compilers,
    sourceImports: [facts],
  });

  assert.deepEqual(decoded.components.map((component) => component.id), ["dialogue", "master"]);
  assert.deepEqual(decoded.exports.map((value) => value.name), ["dialogue.audio", "master.audio"]);
  const voiceSpec = decoded.records.find((record) => record.id === "dialogue.input.0001.spec");
  assert.deepEqual(voiceSpec?.type, audioMixTypes.inputSpec);
  assert.deepEqual((decoded.provenance ?? []).find((item) => item.range.start === voiceInput)?.records,
    ["dialogue.input.0001.spec"]);
});
