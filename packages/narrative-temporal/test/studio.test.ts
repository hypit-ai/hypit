import assert from "node:assert/strict";
import test from "node:test";

import type { StudioPlacement } from "@hypit/studio-companion";

import { narrativeTemporalModuleRef } from "../src/manifest.js";
import { narrativeStudioTemporalDeclarations } from "../src/studio.js";

const placement = (declaration: string, port: string): StudioPlacement => ({
  tag: `semantic:${declaration}`,
  module: narrativeTemporalModuleRef,
  sourcePath: "main.svml",
  declaration,
  id: "claim",
  range: { start: 4, end: 24 },
  records: [], values: [], outputs: ["claim"], outputPorts: [{ name: port, ref: "claim" }],
  children: [], attributes: {}, attributeValueRanges: {}, referenceAttributes: {}, referenceTypes: {}, references: [],
});

test("Narrative temporal companions contribute only primary Instants to the common row", () => {
  const instant = narrativeStudioTemporalDeclarations.find((item) => item.match.declaration === "narrative-instant")!;
  assert.equal(narrativeStudioTemporalDeclarations.some(item => item.match.declaration === "narrative-window"), false);
  assert.deepEqual(instant.project({ placement: placement("Instant", "instant") }),
    [{ id: "claim", label: "claim", output: "claim", range: { start: 4, end: 24 } }]);
});
