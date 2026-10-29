import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorDeclarationRegistry,
  compileAuthorDeclarations,
  installAuthorDeclarationFacets,
  type AuthorResolvedReference,
} from "@hypit/author";
import { spatialTypes } from "@hypit/spatial";
import { timelineTypes } from "@hypit/timeline";

import { hypitPackage } from "../src/activation.js";
import { spatialSequenceModuleRef, spatialSequenceTypes } from "../src/index.js";

test("TimelineRegions keeps document, Timeline and Canvas edges explicit", async () => {
  const registry = new AuthorDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, registry);
  const references = new Map<string, AuthorResolvedReference>([
    ["document", { path: "document", ref: { kind: "record", id: "document" }, type: spatialSequenceTypes.document }],
    ["timeline", { path: "timeline", ref: { kind: "record", id: "timeline" }, type: timelineTypes.timeline }],
    ["canvas", { path: "canvas", ref: { kind: "record", id: "canvas" }, type: spatialTypes.canvas }],
  ]);
  const result = await compileAuthorDeclarations({
    sourceName: "regions.direct",
    declarations: [{
      module: spatialSequenceModuleRef,
      name: "timeline-regions",
      fields: [
        { name: "id", value: { kind: "literal", value: "heads" } },
        { name: "document", value: { kind: "reference", path: "document" } },
        { name: "timeline", value: { kind: "reference", path: "timeline" } },
        { name: "canvas", value: { kind: "reference", path: "canvas" } },
      ],
      children: [],
      range: { start: 0, end: 1 },
    }],
    registry,
    resolveReference: (path) => references.get(path),
    resolveAsset: () => { throw new Error("Spatial sequences use no assets during author compilation."); },
  });

  assert.deepEqual(result.exports.map((value) => ({ name: value.name, type: value.type })), [{
    name: "heads",
    type: spatialSequenceTypes.timelineRegions,
  }]);
  assert.deepEqual(result.components[0]?.inputs, {
    document: { kind: "record", id: "document" },
    timeline: { kind: "record", id: "timeline" },
    canvas: { kind: "record", id: "canvas" },
  });
});
