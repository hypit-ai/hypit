import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets } from "@hypit/author";
import { decodeMarkupDeclarations, installMarkupDeclarationFacets, MarkupDeclarationRegistry } from "@hypit/markup";
import { sealTimeline } from "@hypit/timeline";

import { hypitPackage } from "../src/activation.js";
import {
  decodeRegionSequenceDocument,
  regionSequenceSource,
  resolveTimelineRegionSequence,
  spatialSequenceModuleRef,
  type RegionSequenceDocument,
} from "../src/index.js";

const document: RegionSequenceDocument = {
  clock: { frameRate: { numerator: 30, denominator: 1 } },
  frameCount: 3,
  series: [{ id: "guest-head", regions: [[0.5, 0.1, 0.2, 0.3], null, [0.52, 0.11, 0.2, 0.3]] }],
};

test("a region document stays editable before exact Timeline attachment", async () => {
  const source = regionSequenceSource("heads", document);
  const bodyStart = source.indexOf("\n", source.indexOf("<sequence:Regions")) + 1;
  assert.deepEqual(decodeRegionSequenceDocument(source.slice(bodyStart, source.indexOf("</sequence:Regions>")).trim()), document);
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const declared = await decodeMarkupDeclarations({
    name: "heads.regions.svml",
    text: source.slice(source.indexOf("<svml>")),
  }, {
    resolveModule: () => spatialSequenceModuleRef,
    syntax,
    compilers,
  });
  assert.deepEqual(declared.records.find((record) => record.id === "heads")?.value, document);

  const timeline = sealTimeline({ id: "program", frameCount: 3, frameRate: { numerator: 30, denominator: 1 } });
  const regions = resolveTimelineRegionSequence(document, timeline, { widthPx: 400, heightPx: 800 });
  assert.deepEqual(regions.series[0]?.frames[0], { xPx: 200, yPx: 80, widthPx: 80, heightPx: 240 });
  assert.equal(regions.series[0]?.frames[1], null);
  assert.equal(regions.timelineId, timeline.id);
});

test("Timeline attachment rejects another Clock instead of resampling", () => {
  assert.throws(() => resolveTimelineRegionSequence(document, {
    id: "program", frameCount: 3, frameRate: { numerator: 24, denominator: 1 },
  }, { widthPx: 400, heightPx: 800 }), /exactly equal/u);
});
