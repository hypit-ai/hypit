import assert from "node:assert/strict";
import test from "node:test";

import type {
  StudioPlacement,
  StudioSemanticTimeline,
  StudioTemporalLineage,
} from "@hypit/studio-adapter";
import { projectedWindowTimelineEdits } from "@hypit/studio-adapter";
import type { MarkupSurfaceRegistryLike, RegisteredSurface } from "@hypit/markup";

import { inspectorFieldsForBindings, resolveTimelineEditHandles, sourceBindingsForDraft } from "../src/parameters.js";
import { serializeParameterValue, validateParameterValue } from "../src/parameter-values.js";

const semantic: StudioSemanticTimeline = {
  presentation: {
    family: "speech",
    tone: "teal",
    icon: "timeline",
    lane: { heightPx: 52 },
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

test("structured parameter values validate and serialize through the generic SVS path", () => {
  const schema = { kind: "array", minItems: 1, items: { kind: "string", format: "color" } } as const;
  assert.doesNotThrow(() => validateParameterValue(["#FF3F56", "#FFA72D"], schema, "Colors"));
  assert.throws(() => validateParameterValue([], schema, "Colors"), /at least 1/u);
  assert.equal(serializeParameterValue(["#FF3F56", "#FFA72D"], "svs"), '["#FF3F56","#FFA72D"]');
});

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
  const handles = resolveTimelineEditHandles(
    [], projectedWindowTimelineEdits({ start: "start", end: "end", duration: "for" }), temporal, semantic,
  );

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
  const handles = resolveTimelineEditHandles([], projectedWindowTimelineEdits({
    start: "start", end: "end", duration: "for",
  }), {
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

test("absolute Window edits use only the Companion's exact parameter vocabulary", () => {
  const source = (start: number, end: number) => ({
    path: "main.svml",
    range: { start, end },
    preimage: "1f",
  });
  const parameters = [
    {
      id: "from", binding: "from", name: "from",
      value: "1f", language: "svml" as const, writable: true, source: source(0, 2),
    },
    {
      id: "until", binding: "until", name: "until",
      value: "20f", language: "svml" as const, writable: true, source: source(3, 6),
    },
  ];
  const handles = resolveTimelineEditHandles(
    parameters,
    projectedWindowTimelineEdits({ start: "from", end: "until", duration: "length" }),
    {
      source: { kind: "program" },
      projection: {
        kind: "window", startExpression: "1f", endExpression: "20f",
        startFrame: 1, endFrameExclusive: 20,
      },
      phases: [],
    },
    semantic,
  );

  assert.deepEqual(handles.map((handle) => ({
    gesture: handle.gesture,
    enabled: handle.enabled,
    roles: handle.sources?.map((item) => item.role),
    starts: handle.sources?.map((item) => item.source.range.start),
  })), [
    { gesture: "move", enabled: true, roles: ["start", "end"], starts: [0, 3] },
    { gesture: "trim-start", enabled: true, roles: ["start"], starts: [0] },
    { gesture: "trim-end", enabled: true, roles: ["end"], starts: [3] },
  ]);
});

test("parameter Source paths stay relative to the author workspace", () => {
  const text = "start=\"1f\"";
  const parameters = sourceBindingsForDraft({
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
      id: "entity:item", authoredId: "item", display: { title: "item", layers: [] },
      startFrame: 1, endFrameExclusive: 2, stackOrder: 0,
      elementRange: { start: 0, end: text.length },
    },
    declarations: [{ name: "start", writable: true }],
  });

  assert.equal(parameters[0]!.source.path, "main.svml");
  assert.equal(parameters[0]!.source.preimage, "1f");
});

test("a derived entity follows its actual Style and Companion-owned Recipe presentation", () => {
  const main = "<caption-fine:Track id=\"captions\" program={caption-program}/>";
  const sheet = `<sheet version="1">
  caption.alt { x: 0.4; handoff: overlap; colors: ["#FF3F56", "#FFA72D"]; }
</sheet>`;
  const colors = { kind: "array", minItems: 1, items: { kind: "string", format: "color" } } as const;
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
        { name: "x", required: true, summary: "Horizontal position" },
        { name: "handoff", required: false, summary: "Cue handoff", values: ["cut", "overlap"] },
        { name: "colors", required: false, summary: "Ordered colors", schema: colors },
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

  const draft = {
    id: "captions:cue:2", authoredId: "captions", presentId: "cue:2", display: { title: "cue:2", layers: [] },
    startFrame: 0, endFrameExclusive: 10, stackOrder: 70,
    elementRange: track.range,
    parameterReferences: { program: "alternate-caption" },
  } as const;
  const parameters = sourceBindingsForDraft({
    root: "/workspace",
    files: [
      { path: "main.svml", text: main, language: "svml", imports: [{ alias: "recipes", source: "./recipes.svs" }] },
      { path: "recipes.svs", text: sheet, language: "svs" },
    ],
    placement: track,
    placements: [track, style],
    draft,
    declarations: [{
      name: "program",
      recipe: {
        through: ["recipe"],
        bindings: [
          { name: "x" },
          { name: "handoff" },
          { name: "colors", schema: colors },
          { name: "fallback-colors", schema: colors, fallback: ["#000000"] },
        ],
      },
    }],
  });
  const inspector = inspectorFieldsForBindings(draft, parameters, [
    {
      binding: "program.x", label: "X", domain: "where", page: { id: "placement", label: "Placement" },
      section: { id: "region", label: "Region" }, control: "number",
    },
    {
      binding: "program.handoff", label: "Handoff", domain: "when", page: { id: "cue", label: "Cue" },
      section: { id: "envelope", label: "Envelope" }, control: "select", options: ["cut", "overlap"],
    },
    {
      binding: "program.colors", label: "Colors", domain: "how", page: { id: "paint", label: "Paint" },
      section: { id: "palette", label: "Palette" },
    },
    {
      binding: "program.fallback-colors", label: "Fallback Colors", domain: "how", page: { id: "paint", label: "Paint" },
      section: { id: "palette", label: "Palette" },
    },
  ]);

  assert.deepEqual(inspector.map(({ binding, domain, section, control, options }) => ({
    binding, domain, section: section.id, control, options,
  })), [
    { binding: "program.x", domain: "where", section: "region", control: "number", options: undefined },
    { binding: "program.handoff", domain: "when", section: "envelope", control: "select", options: ["cut", "overlap"] },
    { binding: "program.colors", domain: "how", section: "palette", control: "list", options: undefined },
    { binding: "program.fallback-colors", domain: "how", section: "palette", control: "list", options: undefined },
  ]);
  assert.deepEqual(inspector[2]?.value, ["#FF3F56", "#FFA72D"]);
  assert.deepEqual(inspector[3]?.value, ["#000000"]);
  assert.equal(inspector[3]?.source.preimage, "");
  assert.match(inspector[3]?.source.prefix ?? "", /fallback-colors/u);
  assert.ok(parameters.every((parameter) => parameter.source.path === "recipes.svs"));
});
