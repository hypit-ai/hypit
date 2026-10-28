import { timelineTypes } from "@hypit/timeline";
import assert from "node:assert/strict";
import test from "node:test";

import { compositionTypes } from "@hypit/composition";
import type {
  StudioFilmCompanion,
  StudioPlacement,
  StudioPlacementChild,
  StudioTrackCompanion,
} from "@hypit/studio-companion";

import { inspectStudioInvocation, StudioPreflightError } from "../src/studio-preflight.js";
import type { StudioInvocationSelection } from "../src/studio-preflight.js";
import { StudioCompanionRegistry } from "../src/studio-registry.js";
import { compiledSourceScenario } from "./compiled-source-scenario.js";

const filmModule = { name: "@example/film", version: "1" } as const;
const companion: StudioFilmCompanion = {
  id: "film",
  match: { module: filmModule, declaration: "film", outputType: compositionTypes.composition },
  timeSources: [{ attribute: "semantic", type: timelineTypes.timeline }, { attribute: "space", type: timelineTypes.timeline }],
  tracks: {
    childDeclaration: "Track",
    containerDeclarations: ["Stack"],
    sourceAttribute: "source",
    types: [compositionTypes.visualTrack],
  },
};

const visualCompanion: StudioTrackCompanion = {
  id: "visual",
  family: "visual",
  output: { type: compositionTypes.visualTrack },
};

function placement(id: string): StudioPlacement {
  return {
    sourcePath: "main.svml", tag: "Film", module: filmModule, declaration: "film", id,
    range: { start: 0, end: 1 }, records: [], values: [], outputs: [`${id}.composition`], outputPorts: [],
    children: [], attributes: {}, attributeValueRanges: {}, referenceAttributes: {}, referenceTypes: {}, references: [],
  };
}

test("Studio rejects an Invocation that reaches two distinct Film compositions", () => {
  const source = compiledSourceScenario({
    placements: [placement("one"), placement("two")],
    exports: ["one", "two"].map((id) => ({
      name: `${id}.composition`, ref: `${id}.composition`, type: compositionTypes.composition,
    })),
  });
  const invocation: StudioInvocationSelection = {
    targets: ["one.composition", "two.composition"],
     invocation: { format: "hypit.invocation@1", targets: ["one.composition", "two.composition"], overrides: [] },
  };
  const registry = new StudioCompanionRegistry([], { films: [companion] });
  assert.throws(
    () => inspectStudioInvocation(registry, source, invocation),
    (error: unknown) => error instanceof StudioPreflightError
      && error.issues.some((issue) => issue.includes("multiple Film compositions")),
  );
});

test("Studio preserves every Film occurrence of one reusable VisualTrack", () => {
  const visual = placement("visual");
  const timeline = placement("timeline");
  const track = (id: string): StudioPlacementChild => ({
    sourcePath: "main.svml",
    tag: "Track",
    id,
    range: { start: 0, end: 1 },
    attributes: {},
    attributeValueRanges: {},
    references: ["visual.visual"],
    referenceAttributes: { source: "visual.visual" },
    resolvedReferenceAttributes: { source: "visual.visual" },
    referenceTypes: {},
    values: [],
  });
  const film = {
    ...placement("film"),
    resolvedReferenceAttributes: { semantic: "timeline.timeline" },
    children: [track("background"), {
      sourcePath: "main.svml",
      tag: "Stack",
      id: "inset",
      range: { start: 0, end: 1 },
      attributes: {},
      attributeValueRanges: {},
      references: [],
      referenceAttributes: {},
      referenceTypes: {},
      values: [],
      children: [track("picture")],
    }],
  } satisfies StudioPlacement;
  const source = compiledSourceScenario({
    placements: [
      { ...visual, module: { name: "@example/visual", version: "1" }, declaration: "visual",
        outputs: ["visual.visual"] },
      { ...timeline, module: { name: "@example/timeline", version: "1" }, declaration: "timeline",
        outputs: ["timeline.timeline"] },
      film,
    ],
    exports: [
      { name: "visual.visual", ref: "visual.visual", type: compositionTypes.visualTrack },
      { name: "timeline.timeline", ref: "timeline.timeline", type: timelineTypes.timeline },
      { name: "film.composition", ref: "film.composition", type: compositionTypes.composition },
    ],
  });
  const invocation: StudioInvocationSelection = {
    targets: ["film.composition"],
     invocation: { format: "hypit.invocation@1", targets: ["film.composition"], overrides: [] },
  };
  const registry = new StudioCompanionRegistry([visualCompanion], { films: [companion] });
  const inspection = inspectStudioInvocation(registry, source, invocation);
  assert.deepEqual(
    inspection.tracks.find((track) => track.ref === "visual.visual")?.visualOccurrences,
    [["background"], ["inset", "picture"]],
  );
});
