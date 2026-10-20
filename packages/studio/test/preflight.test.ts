import { timelineTypes } from "@hypit/timeline";
import assert from "node:assert/strict";
import test from "node:test";

import { compositionTypes } from "@hypit/composition";
import type { StudioFilmCompanion, StudioPlacement } from "@hypit/studio-companion";

import { inspectStudioRun, StudioPreflightError } from "../src/studio-preflight.js";
import type { StudioRunSelection } from "../src/studio-preflight.js";
import { StudioCompanionRegistry } from "../src/studio-registry.js";
import { compiledSourceScenario } from "./compiled-source-scenario.js";

const filmModule = { name: "@example/film", version: "1" } as const;
const companion: StudioFilmCompanion = {
  id: "film",
  match: { module: filmModule, surface: "film", outputType: compositionTypes.composition },
  timeSources: [{ attribute: "semantic", type: timelineTypes.timeline }, { attribute: "space", type: timelineTypes.timeline }],
  tracks: { childSurface: "Track", sourceAttribute: "source", types: [compositionTypes.visualTrack] },
};

function placement(id: string): StudioPlacement {
  return {
    sourcePath: "main.svml", tag: "Film", module: filmModule, surface: "film", id,
    range: { start: 0, end: 1 }, records: [], values: [], outputs: [`${id}.composition`], outputPorts: [],
    children: [], attributes: {}, attributeValueRanges: {}, referenceAttributes: {}, referenceTypes: {}, references: [],
  };
}

test("Studio rejects a Run that reaches two distinct Film compositions", () => {
  const source = compiledSourceScenario({
    placements: [placement("one"), placement("two")],
    exports: ["one", "two"].map((id) => ({
      name: `${id}.composition`, ref: `${id}.composition`, type: compositionTypes.composition,
    })),
  });
  const run: StudioRunSelection = {
    targets: ["one.composition", "two.composition"],
    run: { graph: { format: "hypit.run-graph@1", records: [], candidates: [], operations: [], satisfactions: [], targets: [] } },
  };
  const registry = new StudioCompanionRegistry([], { films: [companion] });
  assert.throws(
    () => inspectStudioRun(registry, source, run),
    (error: unknown) => error instanceof StudioPreflightError
      && error.issues.some((issue) => issue.includes("multiple Film compositions")),
  );
});
