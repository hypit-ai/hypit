import assert from "node:assert/strict";
import test from "node:test";

import { captionManifest, captionTypes } from "@hypit/caption";
import { audiovisualManifest } from "@hypit/audiovisual";
import {
  AuthorDeclarationRegistry,
  compileAuthorDeclarations,
  elaborateAuthorGraph,
  installAuthorDeclarationFacets,
  type AuthorDeclaration,
  type AuthorResolvedReference,
  type ResolvedAuthorSourceImport,
} from "@hypit/author";
import { createResolvedClosure, link } from "@hypit/hypit/kernel";
import {
  MarkupDeclarationRegistry,
  decodeMarkupDeclarations,
  installMarkupDeclarationFacets,
} from "@hypit/markup";
import { narrativeManifest } from "@hypit/narrative";
import { narrativeTemporalManifest, narrativeTemporalTypes } from "@hypit/narrative-temporal";
import type { TypedRecord } from "@hypit/protocol";
import { spatialManifest } from "@hypit/spatial";
import { temporalManifest } from "@hypit/temporal";

import { hypitPackage } from "../src/activation.js";
import {
  narrativeCaptionManifest,
  narrativeCaptionModuleRef,
  narrativeCaptionTypes,
} from "../src/index.js";

const declarationRegistry = new AuthorDeclarationRegistry();
const syntax = new MarkupDeclarationRegistry();
installAuthorDeclarationFacets(hypitPackage.facets, declarationRegistry);
installMarkupDeclarationFacets(hypitPackage.facets, syntax);

const documentRecord: TypedRecord = { id: "caption-document", type: captionTypes.document, value: {} };
const bindingRecord: TypedRecord = { id: "caption-binding", type: narrativeCaptionTypes.binding, value: {} };
const timingRecord: TypedRecord = { id: "narrative-timing", type: narrativeTemporalTypes.narrativeLocalTiming, value: {} };
const records: readonly TypedRecord[] = [documentRecord, bindingRecord, timingRecord];

const references = new Map<string, AuthorResolvedReference>([
  ["facts.document", { ref: { kind: "record", id: documentRecord.id }, type: documentRecord.type, record: documentRecord }],
  ["facts.binding", { ref: { kind: "record", id: bindingRecord.id }, type: bindingRecord.type, record: bindingRecord }],
  ["facts.timing", { ref: { kind: "record", id: timingRecord.id }, type: timingRecord.type, record: timingRecord }],
]);

const sourceImport: ResolvedAuthorSourceImport = {
  request: { from: "facts.svml", alias: "facts" },
  source: "facts.svml",
  records,
  exports: [
    { name: "document", ref: { kind: "record", id: documentRecord.id }, type: documentRecord.type },
    { name: "binding", ref: { kind: "record", id: bindingRecord.id }, type: bindingRecord.type },
    { name: "timing", ref: { kind: "record", id: timingRecord.id }, type: timingRecord.type },
  ],
};

const directTiming: AuthorDeclaration = {
  module: narrativeCaptionModuleRef,
  name: "timing",
  fields: [
    { name: "id", value: { kind: "literal", value: "captions" } },
    { name: "document", value: { kind: "reference", path: "facts.document" } },
    { name: "binding", value: { kind: "reference", path: "facts.binding" } },
    { name: "timing", value: { kind: "reference", path: "facts.timing" } },
  ],
  children: [],
  range: { start: 0, end: 1 },
};

test("Narrative Caption Timing direct and Markup declarations lower to the same AuthorGraph", async () => {
  const direct = await compileAuthorDeclarations({
    sourceName: "direct",
    declarations: [directTiming],
    registry: declarationRegistry,
    resolveReference: (path) => references.get(path),
    resolveAsset: () => { throw new Error("Caption Timing does not use assets."); },
  });
  const markup = await decodeMarkupDeclarations({
    name: "timing.svml",
    text: `<svml><import from="@hypit/narrative-caption@1" as="caption"/><import source="facts.svml" as="facts"/><caption:Timing id="captions" document={facts.document} binding={facts.binding} timing={facts.timing}/></svml>`,
  }, {
    resolveModule: () => narrativeCaptionModuleRef,
    syntax,
    compilers: declarationRegistry,
    sourceImports: [sourceImport],
  });

  assert.deepEqual(markup.components, direct.components);
  assert.deepEqual(markup.exports, direct.exports);
  const closure = createResolvedClosure([
    audiovisualManifest,
    temporalManifest,
    spatialManifest,
    captionManifest,
    narrativeManifest,
    narrativeTemporalManifest,
    narrativeCaptionManifest,
  ]);
  assert.deepEqual(
    elaborateAuthorGraph(link(closure, records), markup.components),
    elaborateAuthorGraph(link(closure, records), direct.components),
  );
});
