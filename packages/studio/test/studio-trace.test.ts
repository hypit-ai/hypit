import assert from "node:assert/strict";
import test from "node:test";

import { compositionTypes } from "@hypit/composition";
import { captionTypes } from "@hypit/caption";
import { canonicalize } from "@hypit/protocol";
import type { StudioPlacement } from "@hypit/studio-companion";

import { traceFor } from "../src/studio-trace.js";
import { compiledSourceScenario } from "./compiled-source-scenario.js";

test("Track traces retain direct references to author Records", () => {
  const placement: StudioPlacement = {
    sourcePath: "main.svml", tag: "caption-fine:Caption", surface: "track",
    module: { name: "@hypit/caption-fine", version: "1" }, id: "captions",
    range: { start: 0, end: 1 }, records: [], values: [],
    outputs: ["source::output::captions.track"],
    outputPorts: [{ name: "track", ref: "source::output::captions.track" }],
    resolvedReferenceAttributes: { document: "source::record::story.caption" },
    children: [], attributes: {}, attributeValueRanges: {}, referenceAttributes: {}, referenceTypes: {}, references: [],
  };
  const source = compiledSourceScenario({
    placements: [placement],
    exports: [{ name: "captions.track", ref: "source::output::captions.track", type: compositionTypes.visualTrack }],
    records: [{ id: "source::record::story.caption", type: captionTypes.document, value: canonicalize({}) }],
    recordNames: [{ local: "story.caption", id: "source::record::story.caption" }],
  });

  assert.deepEqual(traceFor(source, "source::output::captions.track").references, [{
    input: "document",
    name: "story.caption",
    ref: "source::record::story.caption",
    type: captionTypes.document.name,
    typeRef: captionTypes.document,
  }]);
});
