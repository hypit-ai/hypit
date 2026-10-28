import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets, type ResolvedAuthorSourceImport } from "@hypit/author";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { hypitPackage } from "../src/activation.js";
import { visualAdjustmentModuleRef, visualAdjustmentTypes } from "../src/index.js";

test("Visual Adjustment declaration keeps Timeline, Window and package-owned Effect as explicit typed inputs", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const facts: ResolvedAuthorSourceImport = {
    request: { from: "facts.svml", alias: "facts" },
    source: "facts.svml",
    records: [{
      id: "effect",
      type: visualAdjustmentTypes.effect,
      value: { format: "example.effect@1", payload: { amount: 0.5 }, artifacts: [] },
    }],
    exports: [
      { name: "timeline", ref: { kind: "record", id: "timeline" }, type: timelineTypes.timeline },
      { name: "window", ref: { kind: "record", id: "window" }, type: temporalTypes.window },
      { name: "effect", ref: { kind: "record", id: "effect" }, type: visualAdjustmentTypes.effect },
    ],
  };
  const decoded = await decodeMarkupDeclarations({
    name: "adjust.svml",
    text: `<svml>
      <import from="@hypit/visual-adjustment@1" as="adjust"/>
      <import source="facts.svml" as="facts"/>
      <adjust:Track id="look" timeline={facts.timeline}>
        <adjust:Adjustment id="cinematic" during={facts.window} effect={facts.effect}/>
      </adjust:Track>
    </svml>`,
  }, {
    resolveModule: () => visualAdjustmentModuleRef,
    syntax,
    compilers,
    sourceImports: [facts],
  });

  assert.deepEqual(decoded.exports.map((value) => value.name), ["look.visual"]);
  assert.equal(decoded.records.some((record) => record.type.name === visualAdjustmentTypes.spec.name), true);
  assert.deepEqual(decoded.components[0]?.inputs["window-0001"], { kind: "record", id: "window" });
});
