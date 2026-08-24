import assert from "node:assert/strict";
import test from "node:test";

import type {
  StudioPlacement,
  StudioSemanticTimeline,
  StudioTemporalLineage,
} from "@hypit/studio-adapter";
import type { MarkupSurfaceRegistryLike, RegisteredSurface } from "@hypit/markup";

import { parametersForDraft, timelineAdjustHandles } from "../src/parameters.js";

const semantic: StudioSemanticTimeline = {
  presentation: {
    family: "speech",
    icon: "speech",
    lane: { layout: "flat", height: { minPx: 44, preferredPx: 52, maxPx: 96 } },
  },
  anchors: [
    { id: "segment:a:start", kind: "segment-start", frame: 0, segmentId: "a" },
    { id: "segment:a:token:1:start", kind: "token-start", frame: 0, segmentId: "a", tokenId: "segment:a:token:1" },
    { id: "segment:a:token:1:end", kind: "token-end", frame: 12, segmentId: "a", tokenId: "segment:a:token:1" },
    { id: "segment:a:end", kind: "segment-end", frame: 12, segmentId: "a" },
  ],
  segments: [{ id: "a", startFrame: 0, endFrameExclusive: 12 }],
  tokens: [{ id: "segment:a:token:1", segmentId: "a", text: "hello", startFrame: 0, endFrameExclusive: 12 }],
  selections: [{
    id: "claim",
    startAnchorId: "segment:a:token:1:start",
    endAnchorId: "segment:a:token:1:end",
    startFrame: 0,
    endFrameExclusive: 12,
  }],
  moments: [],
  provenance: { output: "speech", origin: "run", status: "resolved", errors: [] },
};

test("timeline gestures resolve through the shared Selection identity", () => {
  const temporal: StudioTemporalLineage = {
    source: { kind: "selection", id: "claim" },
    projection: {
      kind: "window",
      startExpression: "selection.claim.start",
      endExpression: "selection.claim.end",
      startFrame: 0,
      endFrameExclusive: 12,
    },
    phases: [],
  };
  const handles = timelineAdjustHandles([], ["move", "trim-start", "trim-end"], temporal, semantic);

  assert.deepEqual(handles.map((handle) => [handle.operation, handle.gesture, handle.coordinate, handle.enabled]), [
    ["timeline.adjust", "move", "semantic-anchor", true],
    ["timeline.adjust", "trim-start", "semantic-anchor", true],
    ["timeline.adjust", "trim-end", "semantic-anchor", true],
  ]);
  assert.deepEqual(handles.map((handle) => handle.semantic), Array.from({ length: 3 }, () => ({
    kind: "selection",
    id: "claim",
    startAnchorId: "segment:a:token:1:start",
    endAnchorId: "segment:a:token:1:end",
  })));
});

test("moving a Moment projection resolves to the shared Moment identity", () => {
  const handles = timelineAdjustHandles([], ["move", "trim-start", "trim-end"], {
    source: { kind: "moment", id: "beat" },
    projection: { kind: "point", expression: "moment.beat", frame: 12 },
    phases: [],
  }, {
    ...semantic,
    moments: [{ id: "beat", anchorId: "segment:a:token:1:end", frame: 12 }],
  });

  assert.deepEqual(handles.map((handle) => [handle.gesture, handle.enabled]), [
    ["move", true],
    ["trim-start", false],
    ["trim-end", false],
  ]);
  assert.deepEqual(handles[0]!.semantic, {
    kind: "moment",
    id: "beat",
    anchorId: "segment:a:token:1:end",
  });
});

test("parameter Source paths stay relative to the author workspace", () => {
  const text = "start=\"1f\"";
  const parameters = parametersForDraft({
    root: "/workspace",
    files: [{ path: "/workspace/main.svml", text, language: "svml" }],
    placement: {
      sourcePath: "main.svml",
      tag: "Item",
      module: { name: "example", version: "1" },
      surface: "track",
      id: "item",
      range: { start: 0, end: text.length },
      records: [], values: [], outputs: [], outputPorts: [], children: [],
      attributes: { start: "1f" },
      attributeValueRanges: { start: { start: 7, end: 9 } },
      referenceAttributes: {}, referenceTypes: {}, references: [],
    },
    draft: {
      id: "entity:item", authoredId: "item", label: "item",
      startFrame: 1, endFrameExclusive: 2, stackOrder: 0,
      elementRange: { start: 0, end: text.length },
    },
    declarations: [{ name: "start", writable: true }],
  });

  assert.equal(parameters[0]!.source.path, "main.svml");
  assert.equal(parameters[0]!.source.preimage, "1f");
});

test("a derived entity follows its actual Style and the package-owned Recipe vocabulary", () => {
  const main = "<caption-fine:Track id=\"captions\" program={caption-program}/>";
  const sheet = `<sheet version="1">
  caption.alt { x: 0.4; handoff: overlap; }
</sheet>`;
  const placement = (input: {
    id: string;
    module: string;
    surface: string;
    references: Readonly<Record<string, string>>;
  }): StudioPlacement => ({
    sourcePath: "main.svml",
    tag: input.surface,
    module: { name: input.module, version: "1" },
    surface: input.surface,
    id: input.id,
    range: { start: 0, end: main.length },
    records: [], values: [], outputs: [], outputPorts: [], children: [], attributes: {},
    attributeValueRanges: {}, referenceAttributes: input.references, referenceTypes: {},
    references: Object.values(input.references),
  });
  const track = placement({
    id: "captions", module: "@hypit/caption-fine", surface: "track",
    references: { program: "caption-program" },
  });
  const style = placement({
    id: "alternate-caption", module: "@hypit/caption-fine", surface: "style",
    references: { recipe: "recipes.caption.alt" },
  });
  const surface = {
    module: { name: "@hypit/caption-fine", version: "1" },
    surface: "style", tag: "Style", mode: "structured", outputs: [],
    vocabulary: { summary: "Caption Style", example: "<Style/>", attributes: [{
      name: "recipe", kind: "reference", required: true, summary: "Recipe",
      recipe: [
        { name: "x", required: true, summary: "Horizontal position", group: "where", section: "region" },
        { name: "handoff", required: false, summary: "Cue handoff", group: "when", section: "envelope", values: ["cut", "overlap"] },
      ],
    }] },
    handler: () => ({ records: [], components: [], fragments: [], exports: [] }),
  } as RegisteredSurface;
  const surfaces: MarkupSurfaceRegistryLike = {
    resolve(module, name) {
      return module.name === surface.module.name && name === surface.surface ? surface : undefined;
    },
    surfaces() { return [surface]; },
  };

  const parameters = parametersForDraft({
    root: "/workspace",
    files: [
      { path: "main.svml", text: main, language: "svml", imports: [{ alias: "recipes", source: "./recipes.svs" }] },
      { path: "recipes.svs", text: sheet, language: "svs" },
    ],
    placement: track,
    placements: [track, style],
    draft: {
      id: "captions:cue:2", authoredId: "captions", presentId: "cue:2", label: "cue:2",
      startFrame: 0, endFrameExclusive: 10, stackOrder: 70,
      elementRange: track.range,
      parameterReferences: { program: "alternate-caption" },
    },
    declarations: [{ name: "program", label: "Program", writable: false }],
    surfaces,
  });

  assert.deepEqual(parameters.map(({ name, group, section, control, options }) => ({
    name, group, section, control, options,
  })), [
    { name: "x", group: "where", section: "region", control: "number", options: undefined },
    { name: "handoff", group: "when", section: "envelope", control: "select", options: ["cut", "overlap"] },
  ]);
  assert.ok(parameters.every((parameter) => parameter.source.path === "recipes.svs"));
});
