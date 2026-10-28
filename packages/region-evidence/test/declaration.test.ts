import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorDeclarationRegistry,
  compileAuthorDeclarations,
  installAuthorDeclarationFacets,
  type AuthorResolvedReference,
} from "@hypit/author";
import { recipeType } from "@hypit/recipe";
import { spatialTypes } from "@hypit/spatial";
import { timelineTypes } from "@hypit/timeline";

import { hypitPackage } from "../src/activation.js";
import { regionEvidenceModuleRef, regionEvidenceTypes } from "../src/index.js";

test("Region Evidence declaration keeps prepared evidence inputs explicit without Markup", async () => {
  const registry = new AuthorDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, registry);
  const references = new Map<string, AuthorResolvedReference>([
    ["picture", { path: "picture", ref: { kind: "record", id: "picture" }, type: spatialTypes.frame }],
    ["timeline", { path: "timeline", ref: { kind: "record", id: "timeline" }, type: timelineTypes.timeline }],
    ["tracking", { path: "tracking", ref: { kind: "record", id: "tracking" }, type: recipeType }],
  ]);
  const result = await compileAuthorDeclarations({
    sourceName: "region.direct",
    declarations: [{
      module: regionEvidenceModuleRef,
      name: "evidence",
      fields: [
        { name: "id", value: { kind: "literal", value: "heads" } },
        { name: "within", value: { kind: "reference", path: "picture" } },
        { name: "timeline", value: { kind: "reference", path: "timeline" } },
        { name: "recipe", value: { kind: "reference", path: "tracking" } },
      ],
      children: [],
      range: { start: 0, end: 1 },
    }],
    registry,
    resolveReference: (path) => references.get(path),
    resolveAsset: () => { throw new Error("Region Evidence uses no assets during author compilation."); },
  });

  assert.deepEqual(result.exports.map((value) => ({ name: value.name, type: value.type })), [{
    name: "heads",
    type: regionEvidenceTypes.evidence,
  }]);
  assert.deepEqual(result.components[0]?.inputs, {
    within: { kind: "record", id: "picture" },
    timeline: { kind: "record", id: "timeline" },
    recipe: { kind: "record", id: "tracking" },
  });
});
