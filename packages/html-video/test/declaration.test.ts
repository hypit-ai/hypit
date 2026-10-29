import assert from "node:assert/strict";
import test from "node:test";

import { AuthorDeclarationRegistry, installAuthorDeclarationFacets, type ResolvedAuthorSourceImport } from "@hypit/author";
import { MarkupDeclarationRegistry, decodeMarkupDeclarations, installMarkupDeclarationFacets } from "@hypit/markup";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";

import { hypitPackage } from "../src/activation.js";
import { htmlVideoDeliverySpec, htmlVideoModuleRef } from "../src/index.js";

test("HTML Video declaration owns delivery and range authoring without choosing a Renderer", async () => {
  const compilers = new AuthorDeclarationRegistry();
  const syntax = new MarkupDeclarationRegistry();
  installAuthorDeclarationFacets(hypitPackage.facets, compilers);
  installMarkupDeclarationFacets(hypitPackage.facets, syntax);
  const facts: ResolvedAuthorSourceImport = {
    request: { from: "facts.svml", alias: "facts" },
    source: "facts.svml",
    records: [],
    exports: [
      { name: "composition", ref: { kind: "record", id: "composition" }, type: compositionTypes.composition },
    ],
  };
  const decoded = await decodeMarkupDeclarations({
    name: "video.svml",
    text: `<svml>
      <import from="@hypit/html-video@1" as="video"/>
      <import source="facts.svml" as="facts"/>
      <video:Video id="final" composition={facts.composition}
        quality="high" start-frame="15" end-frame-exclusive="45"/>
    </svml>`,
  }, {
    resolveModule: () => htmlVideoModuleRef,
    syntax,
    compilers,
    sourceImports: [facts],
  });

  assert.deepEqual(decoded.exports.map((value) => value.name), ["final.video"]);
  assert.deepEqual(decoded.records.find((record) => record.id === "final.delivery"), {
    id: "final.delivery",
    type: mediaTypes.delivery,
    value: htmlVideoDeliverySpec("high"),
  });
  assert.deepEqual(decoded.records.find((record) => record.id === "final.frame-range")?.value, {
    startFrame: 15,
    endFrameExclusive: 45,
  });
  assert.equal(decoded.components[0]?.fragment.inputs.some((input) => input.name === "range"), true);
});
