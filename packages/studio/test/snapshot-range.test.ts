import assert from "node:assert/strict";
import test from "node:test";
import { compositionTypes } from "@hypit/composition";
import { temporalTypes } from "@hypit/temporal";
import type { StudioPlacement, StudioTemporalDeclarationCompanion } from "@hypit/studio-companion";
import { snapshot } from "../src/snapshot.js";
import type { SnapshotProjection } from "../src/snapshot.js";
import { observedTemporalValues } from "../src/temporal-declarations.js";
import { StudioCompanionRegistry } from "../src/studio-registry.js";
import { fallbackStudioTrackCompanions } from "../src/fallback-companions.js";
import { compiledSourceScenario } from "./compiled-source-scenario.js";
import { executedGraph } from "./executed-graph-scenario.js";

test("a pure-MG work keeps its declared extent even when a Studio Item extends beyond it", () => {
  const built: SnapshotProjection = { source: compiledSourceScenario({ placements: [], exports: [] }),
    state: executedGraph({ programRecords: [], steps: [], records: [] }),
    tracks: [{ outputRef: "art.visual", name: "art.visual", type: compositionTypes.visualTrack.name,
      typeRef: compositionTypes.visualTrack, role: "track",
      trace: { outputPorts: [], references: [] }, visualOccurrences: [["foreground", "visual"]], value: {
        kind: "visual", timelineId: "work", visualIr: "hypit.visual-ir@1", id: "visual", items: [
        { kind: "present", id: "scene", span: { startFrame: 0, endFrameExclusive: 150 },
          root: { id: "root", kind: "box", children: [], style: [] } },
        { kind: "adjustment", id: "grade", span: { startFrame: 10, endFrameExclusive: 80 },
          program: { format: "hypit.html-adjustment@1", payload: { filter: "contrast(1.1)" }, artifacts: [] } },
      ] } }],
    timeline: { id: "work", frameCount: 90, frameRate: { numerator: 30, denominator: 1 } },
    values: new Map(), temporalDomainValues: [], temporalValues: [], temporalBindings: new Map(),
  };
  const result = snapshot(new StudioCompanionRegistry(fallbackStudioTrackCompanions), built, {
    revision: 1, path: "main.svml", text: "", run: { path: "main.svrun", targets: [], satisfactions: [] },
    canvas: { width: 1080, height: 1920, clearColor: "#000000" }, frameRate: built.timeline.frameRate,
    preview: { kind: "html-program", srcdoc: "" }, workspaceRoot: "/project", sourceFiles: [], surfaces: {} as never,
  });
  assert.equal(result.timeline.frameCount, 90); assert.equal(result.timeline.durationSec, 3);
  assert.equal(result.tracks[0]!.items[0]!.endFrameExclusive, 150);
  assert.deepEqual(result.tracks[0]!.items[0]!.display.layers, [],
    "the generic terminal projection does not guess a representative child of a Visual Present");
  assert.deepEqual(result.tracks[0]!.items[0]!.terminalTargets, [{ kind: "visual-present", occurrencePath: ["foreground", "visual"], presentId: "scene" }]);
  assert.equal(result.tracks[0]!.items[1]!.display.title, "grade");
  assert.deepEqual(result.tracks[0]!.items[1]!.terminalTargets, [{ kind: "visual-adjustment", occurrencePath: ["foreground", "visual"], adjustmentId: "grade" }]);
  assert.deepEqual(result.tracks[0]!.items[1]!.presentation, { kind: "adjustment", chrome: "compact" });
  assert.equal("clips" in result.tracks[0]!, false);
  assert.equal(result.temporalDomains.length, 1);
  assert.equal(result.temporalDomains[0]!.id, "absolute-declarations");
  assert.deepEqual(result.temporalDomains[0]!.items, []);
  assert.equal("provenance" in result, false);
});

test("the common declaration row displays Instants without duplicating Window intervals", () => {
  const directModule = { name: "example/direct", version: "1" };
  const projectedModule = { name: "example/projected", version: "1" };
  const placement = (module: typeof directModule, surface: string, id: string, output: string) => ({
    tag: surface, module, sourcePath: "main.svml", surface, id, range: { start: 0, end: 10 },
    records: [], values: [], outputs: [output], outputPorts: [{ name: "value", ref: output }], children: [],
    attributes: {}, attributeValueRanges: {}, referenceAttributes: {}, referenceTypes: {}, references: [],
  });
  const placements = [placement(directModule, "window", "direct", "direct.value"),
    placement(projectedModule, "instant", "projected", "projected.value")];
  const state = executedGraph({
    programRecords: [], steps: [],
    records: [
      { id: "run-window", type: temporalTypes.window, value: ({
        id: "direct", subjectId: "direct",
        start: { id: "direct.start", subjectId: "direct", timelineId: "work", frame: 3 },
        end: { id: "direct.end", subjectId: "direct", timelineId: "work", frame: 30 },
        span: { startFrame: 3, endFrameExclusive: 30 },
      }) },
      { id: "computed-instant", type: temporalTypes.instant, value: ({
        id: "projected", subjectId: "projected", timelineId: "work", frame: 18,
      }) },
    ],
  });
  const built: SnapshotProjection = { source: compiledSourceScenario({ placements, exports: [] }), state, tracks: [],
    timeline: { id: "work", frameCount: 90, frameRate: { numerator: 30, denominator: 1 } },
    values: new Map(), temporalDomainValues: [], temporalBindings: new Map(), temporalValues: observedTemporalValues(state, [
      { output: "direct.value", record: "run-window" },
      { output: "projected.value", record: "computed-instant" },
    ]),
  };
  const declaration = (id: string, module: typeof directModule, surface: string): StudioTemporalDeclarationCompanion => ({
    id, match: { module, surface }, project: ({ placement: found }: { placement: StudioPlacement }) => found.id === undefined
      ? [] : [{ id: found.id, label: found.id, output: found.outputPorts[0]!.ref, range: found.range }],
  });
  const registry = new StudioCompanionRegistry(fallbackStudioTrackCompanions, { temporalDeclarations: [
    declaration("direct", directModule, "window"), declaration("projected", projectedModule, "instant"),
  ] });
  const result = snapshot(registry, built, {
    revision: 1, path: "main.svml", text: "", run: { path: "main.svrun", targets: [], satisfactions: [] },
    canvas: { width: 1080, height: 1920, clearColor: "#000000" }, frameRate: built.timeline.frameRate,
    preview: { kind: "html-program", srcdoc: "" }, workspaceRoot: "/project", sourceFiles: [], surfaces: {} as never,
  });
  assert.equal(result.temporalDomains.length, 1);
  assert.deepEqual(result.temporalDomains[0]!.items.map((item) => [item.label, item.kind, item.laneId]), [
    ["projected", "point", "declarations"],
  ]);
  assert.deepEqual(result.temporalDomains[0]!.editItems, []);
  assert.equal(result.temporalDomains[0]!.lanes[0]!.heightPx, 15);
  assert.equal(result.temporalDomains[0]!.lanes[0]!.label, "Instants");
  assert.equal(result.temporalDomains[0]!.items[0]!.appearance, "marker");
  assert.deepEqual(result.temporalDomains[0]!.anchors.map(anchor => anchor.kind), ["instant"]);
  assert.ok(built.temporalValues.some(value => value.id === "direct.value"));
});
