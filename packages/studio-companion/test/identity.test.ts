import assert from "node:assert/strict";
import test from "node:test";

import { authoredChildFor, createStudioCompanionFacet, studioContributionFromPackage } from "../src/index.js";
import type { StudioTrackCompanionContext } from "../src/index.js";

const itemType = { module: { name: "@example/media", version: "1" }, name: "ItemSpec" } as const;

test("typed child values recover an omitted authored id without ordinal guessing", () => {
  const child = {
    sourcePath: "main.svml", tag: "Item", range: { start: 10, end: 40 },
    attributes: {}, attributeValueRanges: {}, references: [], referenceAttributes: {}, referenceTypes: {},
    values: [{ id: "track.item.0001.spec", type: itemType, value: { id: "track.item.0001" } }],
  };
  const context = {
    placement: {
      sourcePath: "main.svml", tag: "Track", module: itemType.module, surface: "track", id: "track",
      range: { start: 0, end: 50 }, records: [], values: [], outputs: [], outputPorts: [], children: [child],
      attributes: {}, attributeValueRanges: {}, references: [], referenceAttributes: {}, referenceTypes: {},
    },
    track: {
      name: "track", type: "Track", typeRef: itemType, outputRef: "track", candidateOrigin: "source", role: "track",
      trace: { references: [], outputPorts: [] }, value: undefined,
    },
    spans: [], values: new Map(), temporalBindings: [], temporalDomains: [], generic: () => [],
  } satisfies StudioTrackCompanionContext;
  assert.equal(authoredChildFor(context, "track.item.0001", [itemType]), child);
  assert.equal(authoredChildFor(context, "track.item.0001", [{ ...itemType, module: { ...itemType.module, version: "2" } }]), undefined);
});

test("temporal relation identities are qualified by the selected physical package", () => {
  const producer = { module: { name: "@example/author", version: "1" }, name: "point" } as const;
  const contribution = studioContributionFromPackage("@project/author", [createStudioCompanionFacet({
    temporalRelations: [{ id: "point", match: { producer, output: "point" }, invert: () => [] }],
  })]);
  assert.equal(contribution.temporalRelations[0]?.id, "@project/author#point");
  assert.deepEqual(contribution.temporalRelations[0]?.match, { producer, output: "point" });
});
