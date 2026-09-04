import assert from "node:assert/strict";
import test from "node:test";

import { compositionTypes } from "@hypit/composition";
import type { PlannedNeed } from "@hypit/core";
import { EndpointRegistry } from "@hypit/driver-node";
import { semanticTrackTypes } from "@hypit/semantic-track";
import type { StudioFilmCompanion, StudioPlacement } from "@hypit/studio-adapter";

import type { CompiledSource } from "../src/compile.js";
import type { RunPlan } from "../src/run.js";
import { inspectStudioRun, StudioPreflightError, unservedNeeds } from "../src/studio-preflight.js";
import { StudioCompanionRegistry } from "../src/studio-registry.js";

const filmModule = { name: "@example/film", version: "1" } as const;
const companion: StudioFilmCompanion = {
  id: "film",
  match: { module: filmModule, surface: "film", outputType: compositionTypes.composition },
  semantic: { attribute: "semantic", type: semanticTrackTypes.track },
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

test("the display closure may reach a Need only through a local Endpoint the Profile installed", () => {
  const normalize = { module: { name: "@hypit/media-pipeline", version: "1" }, name: "normalize-media" } as const;
  const generate = { module: { name: "@hypit/seedance", version: "1" }, name: "seedance-2-mini" } as const;
  const returns = { module: { name: "@hypit/artifact", version: "1" }, name: "BlobArtifact" } as const;
  const needs: PlannedNeed[] = [
    { step: "step:a", port: "media", need: "need:a", result: "record:a", capability: normalize, returns },
    { step: "step:b", port: "video", need: "need:b", result: "record:b", capability: generate, returns },
  ] as unknown as PlannedNeed[];
  assert.deepEqual(unservedNeeds(needs, undefined), ["@hypit/media-pipeline@1#normalize-media", "@hypit/seedance@1#seedance-2-mini"]);
  const endpoints = new EndpointRegistry();
  endpoints.registerImmediateEndpoint("media.local", normalize, returns, () => ({ value: { kind: "inline", value: null } }));
  assert.deepEqual(unservedNeeds(needs, endpoints), ["@hypit/seedance@1#seedance-2-mini"]);
  endpoints.bind(normalize, "media.other");
  assert.deepEqual(unservedNeeds(needs, endpoints), ["@hypit/media-pipeline@1#normalize-media", "@hypit/seedance@1#seedance-2-mini"],
    "a binding to an Endpoint that is not installed for display leaves the Need unserved");
});
