import { programSpaceTypes } from "@hypit/program-space";
import assert from "node:assert/strict";
import test from "node:test";

import { compositionTypes } from "@hypit/composition";
import { semanticTrackTypes } from "@hypit/semantic-track";
import type { StudioFilmCompanion, StudioPlacement } from "@hypit/studio-adapter";

import type { CompiledSource } from "../src/compile.js";
import type { RunPlan } from "../src/run.js";
import { inspectStudioRun, StudioPreflightError } from "../src/studio-preflight.js";
import { StudioCompanionRegistry } from "../src/studio-registry.js";

const filmModule = { name: "@example/film", version: "1" } as const;
const companion: StudioFilmCompanion = {
  id: "film",
  match: { module: filmModule, surface: "film", outputType: compositionTypes.composition },
  timeSources: [{ attribute: "semantic", type: semanticTrackTypes.track }, { attribute: "space", type: programSpaceTypes.programSpace }],
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
  const source = {
    observations: { placements: [placement("one"), placement("two")], sourceMaps: [] },
    served: new Map(),
    exports: ["one", "two"].map((id) => ({
      name: `${id}.composition`, ref: `${id}.composition`, type: "Composition", typeRef: compositionTypes.composition,
    })),
    compiled: { program: { records: [] } },
  } as unknown as CompiledSource;
  const run = {
    source, targets: ["one.composition", "two.composition"], attachments: [],
    runPath: "build.svrun", authorSource: "main.svml",
    run: { graph: { candidates: [], operations: [], satisfactions: [], targets: [] } },
    plan: () => { throw new Error("multi-Film rejection must happen before planning projections"); },
  } as unknown as RunPlan;
  const registry = new StudioCompanionRegistry([], { films: [companion] });
  assert.throws(
    () => inspectStudioRun(registry, source, run),
    (error: unknown) => error instanceof StudioPreflightError
      && error.issues.some((issue) => issue.includes("multiple Film compositions")),
  );
});
