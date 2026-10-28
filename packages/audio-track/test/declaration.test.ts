import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets, type ResolvedAuthorSourceImport } from "@hypit/author";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";
import { mediaTypes } from "@hypit/media";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { hypitPackage } from "../src/activation.js";
import { audioTrackModuleRef, audioTrackTypes } from "../src/index.js";

test("Audio Track declaration consumes typed time values and parses package-neutral cubic Map literals", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const facts: ResolvedAuthorSourceImport = {
    request: { from: "facts.svml", alias: "facts" },
    source: "facts.svml",
    records: [{
      id: "reconstruction",
      type: audioTrackTypes.reconstruction,
      value: { format: "example.audio-reconstruction@1", payload: {}, artifacts: [] },
    }],
    exports: [
      { name: "timeline", ref: { kind: "record", id: "timeline" }, type: timelineTypes.timeline },
      { name: "media", ref: { kind: "record", id: "media" }, type: mediaTypes.prepared },
      { name: "window", ref: { kind: "record", id: "window" }, type: temporalTypes.window },
      { name: "reconstruction", ref: { kind: "record", id: "reconstruction" }, type: audioTrackTypes.reconstruction },
    ],
  };
  const text = `<svml>
    <import from="@hypit/audio-track@1" as="audio"/>
    <import source="facts.svml" as="facts"/>
    <audio:Track id="sound" timeline={facts.timeline}>
      <audio:Clip source={facts.media} during={facts.window} reconstruction={facts.reconstruction}
        gain="0.5" fade-in="2f" fade-out="3f">
        <audio:Curve source-at-start="start" source-control-1="start+250ms"
          source-control-2="end-250ms" source-at-end="end"/>
      </audio:Clip>
    </audio:Track>
  </svml>`;
  const decoded = await decodeMarkupDeclarations({ name: "audio.svml", text }, {
    resolveModule: () => audioTrackModuleRef,
    syntax,
    compilers,
    sourceImports: [facts],
  });

  assert.deepEqual(decoded.exports.map((value) => value.name), ["sound.audio", "sound.program"]);
  const spec = decoded.records.find((record) => record.type.name === audioTrackTypes.clipSpec.name);
  assert.equal((spec?.value as { mix?: { gain?: number } }).mix?.gain, 0.5);
  assert.equal((spec?.value as { reconstruction?: { format?: string } }).reconstruction?.format,
    "example.audio-reconstruction@1");
  assert.deepEqual((spec?.value as { sampling?: { relations?: readonly { kind: string }[] } }).sampling?.relations?.map((item) => item.kind), ["cubic"]);
  assert.deepEqual(decoded.components[0]?.inputs["clip-0001-window"], { kind: "record", id: "window" });
});
