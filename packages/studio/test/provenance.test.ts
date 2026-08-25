import assert from "node:assert/strict";
import test from "node:test";

import type { NodeCompiledSourceClosure } from "@hypit/compiler-node";
import type { StudioPlacement } from "@hypit/studio-adapter";

import { observedCompiledSource } from "../src/compile.js";
import { outputFor, placementFor } from "../src/studio-trace.js";

const type = { module: { name: "example.track", version: "1" }, name: "VisualTrack" } as const;

function placement(sourcePath: string): StudioPlacement {
  return {
    sourcePath,
    tag: "example:Track",
    module: { name: "example.track", version: "1" },
    surface: "track",
    id: "track",
    range: { start: 10, end: 20 },
    records: [],
    values: [],
    outputs: ["visual"],
    outputPorts: [{ name: "visual", ref: "visual" }],
    children: [],
    attributes: { id: "track" },
    attributeValueRanges: { id: { start: 14, end: 19 } },
    referenceAttributes: {},
    referenceTypes: {},
    references: [],
  };
}

test("Studio joins repeated local names through compiler-owned provenance", async () => {
  const element = (source: string, output: string) => ({
    id: `${source}::element::10:20`, source, sourceName: source, frontend: "@hypit/markup@1",
    range: { start: 10, end: 20 }, records: [], components: [{ local: "track", id: `${source}::component::track` }],
    outputs: [{ component: `${source}::component::track`, name: "visual", local: "visual", id: output }],
    inputs: [{ id: `${source}::endpoint::10:id`, name: "id", range: { start: 14, end: 19 }, kind: "literal" as const }],
  });
  const compiled = {
    closure: { entry: "a.svml", units: [] },
    program: { closure: { modules: [] }, records: [] },
    graph: {
      format: "hypit.graph@1", candidates: [], operations: [],
      outputs: [
        { id: "a::output::visual", type, primary: "a-candidate" },
        { id: "b::output::visual", type, primary: "b-candidate" },
      ],
    },
    exports: [{ name: "visual", type, ref: { kind: "logical-output", id: "a::output::visual" } }],
    provenance: { format: "hypit.author-provenance@1", elements: [
      element("a.svml", "a::output::visual"),
      element("b.svml", "b::output::visual"),
    ] },
    attachments: [],
  } as unknown as NodeCompiledSourceClosure;
  const source = await observedCompiledSource(compiled, {
    placements: [placement("a.svml"), placement("b.svml")],
    sourceMaps: [],
  });
  assert.equal(outputFor(source, "b::output::visual")?.ref, "b::output::visual");
  assert.equal(placementFor(source, "b::output::visual")?.sourcePath, "b.svml");
  assert.equal(placementFor(source, "b::output::visual")?.authorEndpoints?.id, "b.svml::endpoint::10:id");
});
