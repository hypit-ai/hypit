import assert from "node:assert/strict";
import test from "node:test";

import type {
  StudioPlacement,
  StudioTemporalDomainView,
  StudioTemporalLineage,
} from "@hypit/studio-companion";
import type { MarkupSurfaceRegistryLike, RegisteredSurface } from "@hypit/markup";

import { inspectorFieldsForBindings, resolveTimelineEditHandles, sourceBindingsForDraft } from "../src/parameters.js";
import { serializeParameterValue, validateParameterValue } from "../src/parameter-values.js";

const temporalIdentity = { timelineId: "speech", narrativeId: "story" } as const;
const narrativeSourceIdentity = { ...temporalIdentity,
  domain: { companion: "script", id: "story" },
  type: { module: { name: "@hypit/narrative", version: "1" }, name: "NarrativeReference" } } as const;
const timelineSourceType = { module: { name: "@hypit/timeline", version: "1" }, name: "Timeline" } as const;

const temporalDomain: StudioTemporalDomainView = {
  id: "story", companion: "script", timelineId: "speech",
  presentation: { family: "speech", tone: "teal", icon: "timeline" },
  lanes: [{ id: "intent", heightPx: 26 }],
  anchors: [
    { id: "segment:a:start", kind: "segment-start", frame: 0 },
    { id: "segment:a:token:1:start", kind: "token-start", frame: 0 },
    { id: "segment:a:token:1:end", kind: "token-end", frame: 12 },
    { id: "segment:a:end", kind: "segment-end", frame: 12 },
  ],
  items: [],
  editItems: [{ kind: "span", appearance: "block", id: "claim", laneId: "intent", label: "claim",
    source: { type: narrativeSourceIdentity.type, kind: "selection", id: "claim" }, editable: true,
    startAnchorId: "segment:a:token:1:start",
    endAnchorId: "segment:a:token:1:end",
    startFrame: 0,
    endFrameExclusive: 12,
  }],
  provenance: { output: "speech", origin: "run", status: "resolved", errors: [] },
  source: { path: "main.svml", content: { start: 0, end: 100 } },
};

const withMoment: StudioTemporalDomainView = { ...temporalDomain, editItems: [...temporalDomain.editItems, {
  kind: "point", appearance: "marker", id: "beat", laneId: "intent", label: "beat",
  source: { type: narrativeSourceIdentity.type, kind: "moment", id: "beat" }, editable: true,
  anchorId: "segment:a:token:1:end", frame: 12,
}] };

test("structured parameter values validate and serialize through the generic SVS path", () => {
  const schema = { kind: "array", minItems: 1, items: { kind: "string" } } as const;
  assert.doesNotThrow(() => validateParameterValue(["#FF3F56", "#FFA72D"], schema, "Colors"));
  assert.throws(() => validateParameterValue([], schema, "Colors"), /at least 1/u);
  assert.equal(serializeParameterValue(["#FF3F56", "#FFA72D"], "svs"), '["#FF3F56","#FFA72D"]');
});

test("timeline gestures resolve through the shared Selection identity", () => {
  const temporal: StudioTemporalLineage = {
    record: "claim.window",
    projection: {
      kind: "window",
      start: {
        kind: "instant", expression: "selection.start", reference: "selection.start", frame: 0,
        source: { ...narrativeSourceIdentity, kind: "selection", id: "claim" },
        authority: { kind: "domain", source: { ...narrativeSourceIdentity, kind: "selection", id: "claim" }, boundary: "start" },
      },
      end: {
        kind: "instant", expression: "selection.end", reference: "selection.end", frame: 12,
        source: { ...narrativeSourceIdentity, kind: "selection", id: "claim" },
        authority: { kind: "domain", source: { ...narrativeSourceIdentity, kind: "selection", id: "claim" }, boundary: "end" },
      },
      startFrame: 0,
      endFrameExclusive: 12,
    },
  };
  const handles = resolveTimelineEditHandles([], temporal, [temporalDomain]);

  assert.deepEqual(handles.map((handle) => [handle.operation, handle.gesture, handle.coordinate, handle.enabled]), [
    ["timeline.adjust", "move", "domain-anchor", true],
    ["timeline.adjust", "trim-start", "domain-anchor", true],
    ["timeline.adjust", "trim-end", "domain-anchor", true],
  ]);
  assert.deepEqual(handles.map((handle) => handle.domain), Array.from({ length: 3 }, () => ({
    kind: "span", companion: "script", domainId: "story", itemId: "claim",
    startAnchorId: "segment:a:token:1:start",
    endAnchorId: "segment:a:token:1:end",
  })));
});

test("moving a Moment projection resolves to the shared Moment identity", () => {
  const handles = resolveTimelineEditHandles([], {
    record: "beat.instant",
    projection: {
      kind: "instant", expression: "moment.cue", reference: "moment.cue", frame: 12,
      source: { ...narrativeSourceIdentity, kind: "moment", id: "beat" },
      authority: { kind: "domain", source: { ...narrativeSourceIdentity, kind: "moment", id: "beat" }, boundary: "cue" },
    },
  }, [withMoment]);

  assert.deepEqual(handles.map((handle) => [handle.gesture, handle.enabled]), [["move", true]]);
  assert.deepEqual(handles[0]!.domain, {
    kind: "point", companion: "script", domainId: "story", itemId: "beat",
    anchorId: "segment:a:token:1:end",
  });
});

test("at/for and until/for derive complementary semantic and duration inverses", () => {
  const duration = {
    id: "for", binding: "for", name: "for", value: "8f", language: "svml" as const, writable: true,
    source: { endpoint: "main::for", path: "main.svml", range: { start: 4, end: 6 }, preimage: "8f" },
  };
  const moment = {
    kind: "instant" as const, expression: "moment.cue", reference: "moment.cue" as const, frame: 12,
    source: { ...narrativeSourceIdentity, kind: "moment" as const, id: "beat" },
    authority: { kind: "domain" as const, source: { ...narrativeSourceIdentity, kind: "moment" as const, id: "beat" }, boundary: "cue" as const },
  };
  const after = {
    kind: "instant" as const, expression: "moment.cue+8f", reference: "moment.cue" as const, frame: 20,
    source: { ...narrativeSourceIdentity, kind: "moment" as const, id: "beat" },
    authority: { kind: "parameter" as const, binding: "for", relation: "after-start" as const },
  };
  const before = {
    kind: "instant" as const, expression: "moment.cue-8f", reference: "moment.cue" as const, frame: 4,
    source: { ...narrativeSourceIdentity, kind: "moment" as const, id: "beat" },
    authority: { kind: "parameter" as const, binding: "for", relation: "before-end" as const },
  };
  const atFor = resolveTimelineEditHandles([duration], {
    record: "beat.after",
    projection: { kind: "window", start: moment, end: after, startFrame: 12, endFrameExclusive: 20 },
  }, [withMoment]);
  assert.deepEqual(atFor.map((handle) => [handle.gesture, handle.domain?.kind, handle.sources?.map((source) => source.role)]), [
    ["move", "point", ["duration"]],
    ["trim-start", "point", ["duration"]],
    ["trim-end", undefined, ["duration"]],
  ]);

  const untilFor = resolveTimelineEditHandles([duration], {
    record: "beat.before",
    projection: { kind: "window", start: before, end: moment, startFrame: 4, endFrameExclusive: 12 },
  }, [withMoment]);
  assert.deepEqual(untilFor.map((handle) => [handle.gesture, handle.domain?.kind, handle.sources?.map((source) => source.role)]), [
    ["move", "point", ["duration"]],
    ["trim-start", undefined, ["duration"]],
    ["trim-end", "point", ["duration"]],
  ]);
});

test("absolute Window edits work without a semantic lane and use the Companion's parameter vocabulary", () => {
  const source = (start: number, end: number) => ({
    endpoint: `main::${start}`,
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
    {
      record: "absolute.window",
      projection: {
        kind: "window",
        start: {
          kind: "instant", expression: "1f", reference: "absolute", frame: 1, source: { timelineId: "animation", type: timelineSourceType, kind: "timeline", id: "animation" },
          authority: { kind: "parameter", binding: "from", relation: "direct" },
        },
        end: {
          kind: "instant", expression: "20f", reference: "absolute", frame: 20, source: { timelineId: "animation", type: timelineSourceType, kind: "timeline", id: "animation" },
          authority: { kind: "parameter", binding: "until", relation: "direct" },
        },
        startFrame: 1, endFrameExclusive: 20,
      },
    },
    undefined,
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

test("independent reference endpoints expose local edits without claiming their Script identities", () => {
  const endpoints = (["start", "end"] as const).map((name, index) => ({
    kind: "instant" as const, expression: index === 0 ? "selection.start" : "moment.cue",
    reference: index === 0 ? "selection.start" as const : "moment.cue" as const,
    frame: index === 0 ? 2 : 20,
    source: { ...narrativeSourceIdentity, kind: index === 0 ? "selection" as const : "moment" as const, id: index === 0 ? "claim" : "beat" },
    authority: { kind: "parameter" as const, binding: name, relation: "direct" as const },
  }));
  const bindings = (["start", "end"] as const).map((name, index) => ({
    id: name, binding: name, name, value: endpoints[index]!.expression,
    language: "svml" as const, writable: true,
    source: { endpoint: `main::${name}`, path: "main.svml", range: { start: index * 20, end: index * 20 + 10 }, preimage: endpoints[index]!.expression },
  }));
  const handles = resolveTimelineEditHandles(bindings, { projection: {
    kind: "window", start: endpoints[0]!, end: endpoints[1]!, startFrame: 2, endFrameExclusive: 20,
  }, record: "references.window" }, [temporalDomain]);
  assert.deepEqual(handles.map(({ gesture, enabled, domain, sources }) => ({ gesture, enabled, domain, roles: sources?.map(source => source.role) })), [
    { gesture: "move", enabled: true, domain: undefined, roles: ["start", "end"] },
    { gesture: "trim-start", enabled: true, domain: undefined, roles: ["start"] },
    { gesture: "trim-end", enabled: true, domain: undefined, roles: ["end"] },
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
      id: "item:item", authoredId: "item", display: { title: "item", layers: [] },
      startFrame: 1, endFrameExclusive: 2, stackOrder: 0,
      elementRange: { start: 0, end: text.length },
    },
    declarations: [{ name: "start", writable: true }],
  });

  assert.equal(parameters[0]!.source.path, "main.svml");
  assert.equal(parameters[0]!.source.preimage, "1f");
});

test("nested declared references reach the font attribute, not the referring Style", () => {
  const text = '<Font family="montserrat"/>';
  const base = (id: string): StudioPlacement => ({
    id, sourcePath: "main.svml", tag: "Test", module: { name: "example", version: "1" },
    surface: "test", range: { start: 0, end: text.length }, records: [], values: [],
    outputs: [`main::record::${id}`], outputPorts: [], children: [], attributes: {},
    attributeValueRanges: {}, referenceAttributes: {}, referenceTypes: {}, references: [],
  });
  const track: StudioPlacement = { ...base("track"),
    referenceAttributes: { style: "shared-style" },
    resolvedReferenceAttributes: { style: "main::record::style" },
  };
  const style: StudioPlacement = { ...base("style"), referenceAttributes: { font: "shared-font" },
    resolvedReferenceAttributes: { font: "main::record::font" },
  };
  const font: StudioPlacement = { ...base("font"), attributes: { family: "montserrat" },
    attributeValueRanges: { family: { start: 14, end: 24 } },
  };
  const parameters = sourceBindingsForDraft({
    root: "/workspace", files: [{ path: "main.svml", text, language: "svml" }],
    placement: track, placements: [track, style, font],
    draft: { id: "track:item", authoredId: "track", display: { title: "track", layers: [] },
      startFrame: 0, endFrameExclusive: 10, stackOrder: 0, elementRange: track.range },
    declarations: [{ name: "style", referenced: [{ name: "font", referenced: [{ name: "family", writable: true }] }] }],
  });
  const family = parameters.find(parameter => parameter.binding === "style.font.family");
  assert.equal(family?.value, "montserrat");
  assert.equal(family?.source.preimage, "montserrat");
  assert.equal(family?.writable, true);
});

test("a derived Item follows its actual Style and Companion-owned Recipe presentation", () => {
  const main = "<scene:Track id=\"captions\" layout={baseline-layout}/>";
  const sheet = `<?svml using="@hypit/recipe@1"?>
<sheet version="1">
  caption.alt { x: 0.4; handoff: overlap; colors: ["#FF3F56", "#FFA72D"]; }
</sheet>`;
  const colors = { kind: "array", minItems: 1, items: { kind: "string" } } as const;
  const placement = (input: {
    id: string;
    module: string;
    surface: string;
    references: Readonly<Record<string, string>>;
    resolvedReferences?: Readonly<Record<string, string>>;
    outputs?: readonly string[];
  }): StudioPlacement => ({
    sourcePath: "main.svml",
    tag: input.surface,
    module: { name: input.module, version: "1" },
    surface: input.surface,
    id: input.id,
    range: { start: 0, end: main.length },
    records: [], values: [], outputs: input.outputs ?? [], outputPorts: [], children: [], attributes: {},
    attributeValueRanges: {}, referenceAttributes: input.references, referenceTypes: {},
    ...(input.resolvedReferences === undefined ? {} : { resolvedReferenceAttributes: input.resolvedReferences }),
    references: Object.values(input.references),
  });
  const track = placement({
    id: "captions", module: "@hypit/caption-fine", surface: "track",
    references: { layout: "baseline-layout" },
    resolvedReferences: { layout: "main::record::baseline-layout" },
  });
  const layout = placement({
    id: "baseline-layout", module: "@example/layout", surface: "layout",
    references: {}, outputs: ["main::record::baseline-layout"],
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
    handler: () => ({ records: [], components: [], exports: [] }),
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
    parameterReferences: { layout: "alternate-caption" },
  } as const;
  const parameters = sourceBindingsForDraft({
    root: "/workspace",
    files: [
      { path: "/workspace/main.svml", text: main, language: "svml", imports: [{ alias: "recipes", source: "./recipes.svs" }] },
      { path: "recipes.svs", text: sheet, language: "svs" },
    ],
    placement: track,
    placements: [track, layout, style],
    draft,
    declarations: [{
      name: "layout",
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
      binding: "layout.x", label: "X", domain: "where", page: { id: "placement", label: "Placement" },
      section: { id: "region", label: "Region" }, control: "number",
    },
    {
      binding: "layout.handoff", label: "Handoff", domain: "when", page: { id: "cue", label: "Cue" },
      section: { id: "envelope", label: "Envelope" }, control: "select", options: ["cut", "overlap"],
    },
    {
      binding: "layout.colors", label: "Colors", domain: "how", page: { id: "paint", label: "Paint" },
      section: { id: "palette", label: "Palette" },
      valuePresentation: { kind: "list", item: { kind: "color" } },
    },
    {
      binding: "layout.fallback-colors", label: "Fallback Colors", domain: "how", page: { id: "paint", label: "Paint" },
      section: { id: "palette", label: "Palette" },
    },
  ]);

  assert.deepEqual(inspector.map(({ binding, domain, section, control, options }) => ({
    binding, domain, section: section.id, control, options,
  })), [
    { binding: "layout.x", domain: "where", section: "region", control: "number", options: undefined },
    { binding: "layout.handoff", domain: "when", section: "envelope", control: "select", options: ["cut", "overlap"] },
    { binding: "layout.colors", domain: "how", section: "palette", control: "list", options: undefined },
    { binding: "layout.fallback-colors", domain: "how", section: "palette", control: "list", options: undefined },
  ]);
  assert.deepEqual(inspector[2]?.value, ["#FF3F56", "#FFA72D"]);
  assert.deepEqual(inspector[2]?.valuePresentation, { kind: "list", item: { kind: "color" } });
  assert.deepEqual(inspector[3]?.value, ["#000000"]);
  assert.equal(inspector[3]?.edit?.source.preimage, "");
  assert.match(inspector[3]?.edit?.source.prefix ?? "", /fallback-colors/u);
  assert.ok(parameters.every((parameter) => parameter.source.path === "recipes.svs"));
});


test("Inspector keeps selected read-only bindings and computed facts beside editable fields", () => {
  const source = { path: "main.svml", range: { start: 0, end: 4 }, preimage: "wide" };
  const fields = inspectorFieldsForBindings({
    id: "use", authoredId: "use", display: { title: "Use", layers: [] },
    startFrame: 15, endFrameExclusive: 90, stackOrder: 0,
    inspector: [{ id: "range", label: "Range", domain: "when", section: { id: "placement", label: "Placement" }, value: "15–90", unit: "f" }],
  }, [
    { id: "style", binding: "style", name: "style", value: "wide", language: "svml", writable: false, source },
    { id: "width", binding: "frame.width", name: "width", value: "78%", language: "svml", writable: true, source },
    { id: "private", binding: "private", name: "private", value: "unexposed", language: "svml", writable: false, source },
  ], [
    { binding: "style", label: "Style", domain: "how", section: { id: "style", label: "Style" }, control: "text" },
    { binding: "frame.width", label: "Width", domain: "where", section: { id: "placement", label: "Placement" }, control: "number" },
  ]);
  assert.equal(fields.length, 3);
  assert.equal(fields[0]?.value, "wide");
  assert.equal(fields[0]?.edit, undefined);
  assert.equal(fields[1]?.edit?.source, source);
  assert.equal(fields[2]?.value, "15–90");
  assert.equal(fields[2]?.edit, undefined);
  assert.equal(fields[2]?.binding, undefined);
});
