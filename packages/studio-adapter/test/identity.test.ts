import assert from "node:assert/strict";
import test from "node:test";

import { authoredChildFor } from "../src/index.js";
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
  } as unknown as StudioTrackCompanionContext;
  assert.equal(authoredChildFor(context, "track.item.0001", [itemType]), child);
  assert.equal(authoredChildFor(context, "track.item.0001", [{ ...itemType, module: { ...itemType.module, version: "2" } }]), undefined);
});
