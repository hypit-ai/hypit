import { renderComponentWorkshop } from "./scenes/components/index.js";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { renderSemanticWorkshop } from "./scenes/semantic-time/index.js";
import { renderDeliveryWorkshop } from "./scenes/delivery/index.js";
import { renderCodeJourney } from "./scenes/code-route/index.js";
import { renderOutro } from "./scenes/outro/index.js";
import { sceneCompanions } from "./studio.js";
import { createStudioTrackCompanionFacet } from "@hypit/studio-companion";
import { renderRoad } from "./scenes/editor-route/index.js";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { createAuthorDeclarationFacet, declarationField, sealGraphFragment } from "@hypit/hypit/author";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import { timelineTypes } from "@hypit/timeline";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes, assertTemporalInstantFor } from "@hypit/temporal";
import { resolveAuthorTimeline, resolveAuthorWindow, resolveAuthorInstant,
  temporalContextFieldShape, temporalWindowFieldShape, temporalInstantFieldShape } from "@hypit/temporal/author";
import { renderIntro, renderComparison } from "./render.js";
const module = { name: "@explainer/web-scenes", version: "1" },
  type = (name) => ({ module, name }),
  producer = (name) => ({ module, name }),
  port = (name, type) => ({ name, type });
const options = type("Options"),
  events = type("Events");
const common = [
  port("timeline", timelineTypes.timeline),
  port("within", spatialTypes.frame),
  port("window", temporalTypes.window),
  port("font", mediaTypes.fontArtifact),
  port("options", options),
  port("events", events),
];
const tags = {
  ComponentWorkshop: {
    name: "component-workshop",
    render: renderComponentWorkshop,
    assets: ["v0", "v1", "v2", "v3", "v4", "v5"],
    defaults: {},
  },
  SemanticWorkshop: {
    name: "semantic-workshop",
    render: renderSemanticWorkshop,
    assets: ["creatify", "higgsfield"],
    defaults: {},
  },
  DeliveryWorkshop: {
    name: "delivery-workshop",
    render: renderDeliveryWorkshop,
    assets: ["film", "clone", "water", "reference", "host", "thumb1", "thumb2", "thumb3"],
    defaults: {},
  },
  CodeJourney: {
    name: "code-journey",
    render: renderCodeJourney,
    assets: ["codex", "remotion", "hyperframes", "ranking", "podcast", "interview", "target"],
    defaults: {},
  },
  Outro: {
    name: "outro",
    render: renderOutro,
    assets: [
      "page",
      "codex",
      "portraits-0",
      "portraits-1",
      "portraits-2",
      "portraits-3",
      "portraits-4",
    ],
    defaults: {},
  },
  Road: {
    name: "road",
    render: renderRoad,
    assets: [
      "page",
      "sample",
      "codex",
      "capcut",
      "premiere",
      "resolve",
      "logo",
      "portrait",
      "thumb-a",
      "thumb-b",
      "thumb-c",
      "thumb-d",
      "thumb-e",
      "thumb-f",
      "thumb-g",
    ],
    defaults: {},
  },
  Introduction: {
    name: "intro",
    render: renderIntro,
    assets: [
      "page",
      "code",
      "readme",
      "codex",
      "claude",
      "reference-ranking",
      "reference-podcast",
      "reference-interview",
      "hypit-ranking",
      "hypit-podcast",
      "hypit-interview",
    ],
    defaults: {},
  },
  Comparison: {
    name: "comparison",
    render: renderComparison,
    assets: [
      "left",
      "right",
      "price-a",
      "price-b",
      "templates-a",
      "templates-b",
      "case-a",
      "case-b",
      "logo-a",
      "logo-b",
    ],
    defaults: {},
  },
};
const images = new Set([
  "creatify",
  "higgsfield",
  "host",
  "reference",
  "thumb1",
  "thumb2",
  "thumb3",
  "remotion",
  "hyperframes",
  "portraits-0",
  "portraits-1",
  "portraits-2",
  "portraits-3",
  "portraits-4",
  "codex",
  "claude",
  "logo-a",
  "logo-b",
  "capcut",
  "premiere",
  "resolve",
  "logo",
  "portrait",
  "thumb-a",
  "thumb-b",
  "thumb-c",
  "thumb-d",
  "thumb-e",
  "thumb-f",
  "thumb-g",
]);
const assetType = (n) => (images.has(n) ? mediaTypes.blobArtifact : mediaTypes.prepared);
const authoredAssetType = (n) => (images.has(n) ? mediaTypes.blobArtifact : mediaTypes.prepared);
const ins = (tag) => [...common, ...tags[tag].assets.map((n) => port(n, assetType(n)))];
export const manifest = {
  format: "hypit.module@1",
  ...module,
  dependencies: [
    ...new Map(
      [
        compositionTypes.visualTrack,
        mediaTypes.blobArtifact,
        mediaTypes.fontArtifact,
        mediaTypes.prepared,
        timelineTypes.timeline,
        spatialTypes.frame,
        temporalTypes.window,
        temporalTypes.instant,
        temporalTypes.duration, temporalTypes.extent, temporalTypes.shiftSpec,
      ].map((t) => [t.module.name, t.module]),
    ).values(),
  ],
  types: ["Options", "Events"],
  capabilities: [],
  producers: [
    { name: "empty", inputs: [], result: { kind: "output", ...port("events", events) } },
    {
      name: "append",
      inputs: [
        port("timeline", timelineTypes.timeline),
        port("events", events),
        port("options", options),
        port("at", temporalTypes.instant),
      ],
      result: { kind: "output", ...port("events", events) },
    },
    ...Object.keys(tags).map((tag) => ({
      name: tags[tag].name,
      inputs: ins(tag),
      result: { kind: "output", ...port("track", compositionTypes.visualTrack) },
    })),
  ],
};
const valueOf = (r) => {
    if (!r) throw Error("Expected scene value");
    return r.value;
  },
  value = (v) => ((canonicalize(v))),
  out = (_name, v) => ({ kind: "output", value: value(v) });
const component = {
  producers: [
    { producer: producer("empty"), handler: () => out("events", []) },
    {
      producer: producer("append"),
      handler: ({ inputs: i }) => {
        const o = valueOf(i.options),
          at = valueOf(i.at),
          list = valueOf(i.events);
        assertTemporalInstantFor(at, {
          subjectId: o.id,
          space: valueOf(i.timeline),
        });
        if (list.some((e) => e.name === o.name)) throw Error("Beat names must be unique");
        return out("events", [...list, { ...o, at }]);
      },
    },
    ...Object.keys(tags).map((tag) => ({
      producer: producer(tags[tag].name),
      handler: ({ inputs: i }) =>
        out(
          "track",
          tags[tag].render(
            valueOf(i.timeline),
            valueOf(i.within),
            valueOf(i.window),
            valueOf(i.font),
            valueOf(i.options),
            valueOf(i.events),
            Object.fromEntries(
              tags[tag].assets.map((n) => [n, images.has(n) ? i[n].value : valueOf(i[n])]),
            ),
          ),
        ),
    })),
  ],
};
const literal = (declaration, name) => {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) throw Error(`${declaration.name}.${name} must be text`);
  return field.value.trim();
};
const resolved = async (declaration, name, expected, resolveReference) => {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw Error(`${declaration.name}.${name} must be a reference`);
  const found = await resolveReference(field.path);
  if (!found || !sameType(found.type, expected)) throw Error(`${declaration.name}.${name} has wrong type`);
  return found;
};
function compiler(tag) {
  const spec = tags[tag];
  return {
    module,
    declaration: spec.name,
    outputs: [options, events, compositionTypes.visualTrack],
    shape: {
      summary: "One code-authored explainer scene with named temporal beats.",
      fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names the scene." },
        temporalContextFieldShape, temporalWindowFieldShape,
        { name: "within", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Places the scene." },
        { name: "font", kind: "reference", required: true, accepts: [mediaTypes.fontArtifact], summary: "Selects its font." },
        ...spec.assets.map((name) => ({ name, kind: "reference", required: true, accepts: [authoredAssetType(name)], summary: name })),
        ...Object.keys(spec.defaults).map((name) => ({ name, kind: "literal", required: false, summary: name })),
      ],
      children: [{ name: "Beat", cardinality: "many", summary: "One named absolute scene event.", fields: [
        { name: "name", kind: "literal", required: true, summary: "Behavioral event name." }, temporalInstantFieldShape,
      ] }],
    },
    bindings(declaration) {
      const id = literal(declaration, "id");
      return [{ name: `${id}.visual`, ref: { kind: "component-output", component: id, output: "visual" }, type: compositionTypes.visualTrack }];
    },
    async compile({ declaration: element, resolveReference }) {
    const spec = tags[tag];
    const id = literal(element, "id"),
      timeline = await resolveAuthorTimeline(element, resolveReference),
      window = await resolveAuthorWindow(element, resolveReference);
    const opts = { id };
    for (const [n, d] of Object.entries(spec.defaults)) {
      const authored = declarationField(element, n);
      if (authored !== undefined && authored.kind !== "literal") throw Error(n + " must be literal");
      const v = authored?.value;
      opts[n] = typeof d === "number" ? Number(v ?? d) : (v ?? d);
    }
    const records = [
        {
          id: id + ".options",
          type: options,
          value: value(opts),
          range: element.range,
        },
      ];
    const inputs = ins(tag).filter((p) => p.name !== "events")
      .map((port) => spec.assets.includes(port.name) ? { ...port, type: authoredAssetType(port.name) } : port),
      bindings = {
        timeline: timeline.ref,
        within: (await resolved(element, "within", spatialTypes.frame, resolveReference)).ref,
        window: window.ref,
        font: (await resolved(element, "font", mediaTypes.fontArtifact, resolveReference)).ref,
        options: { kind: "record", id: id + ".options" },
      };
    for (const n of spec.assets) bindings[n] = (await resolved(element, n, authoredAssetType(n), resolveReference)).ref;
    const input = (name) => ({ kind: "fragment-input", name }),
      op = (operation) => ({ kind: "fragment-operation", operation }),
      operations = [
        {
          id: "empty",
          producer: producer("empty"),
          inputs: {},
          result: { kind: "output", name: "events" },
        },
      ];
    let prev = "empty",
      count = 0;
    for (const ch of element.children) {
      const name = literal(ch, "name"),
        key = "beat" + ++count,
        eid = id + "." + key,
        at = await resolveAuthorInstant(ch, resolveReference);
      records.push({
        id: eid + ".options",
        type: options,
        value: value({ id: eid, name }),
        range: ch.range,
      });
      inputs.push(port(key, options), port(key + "-at", temporalTypes.instant));
      bindings[key] = { kind: "record", id: eid + ".options" };
      bindings[key + "-at"] = at.ref;
      operations.push({
        id: key,
        producer: producer("append"),
        inputs: {
          timeline: input("timeline"),
          events: op(prev),
          options: input(key),
          at: input(key + "-at"),
        },
        result: { kind: "output", name: "events" },
      });
      prev = key;
    }
    operations.push({
      id: "render",
      producer: producer(spec.name),
      inputs: {
        ...Object.fromEntries(
          ins(tag)
            .filter((p) => p.name !== "events")
            .map((p) => [p.name, input(p.name)]),
        ),
        events: op(prev),
      },
      result: { kind: "output", name: "track" },
    });
    const fragment = sealGraphFragment({
      inputs,
      operations,
      exports: [
        {
          name: "visual",
          type: compositionTypes.visualTrack,
          root: op("render"),
        },
      ],
    });
    return {
      records,
      components: [
        {
          id,
          fragment,
          inputs: bindings,
          outputs: { visual: id + ".visual" },
          range: element.range,
        },
      ],
    };
    },
  };
}
const declarations = Object.keys(tags).map((tag) => compiler(tag));
export const hypitPackage = {
  format: "hypit.package@1",
  modules: [{ manifest }],
  facets: [
    createProducerPackageFacet(component.producers ?? []),
    createRefinementPackageFacet(component.refinements ?? []),
    createStudioTrackCompanionFacet(sceneCompanions(module, tags)),
    ...declarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...Object.entries(tags).map(([tag, spec]) => createMarkupDeclarationFacet({
      module, declaration: { name: spec.name, tag, body: "structured" },
    })),
  ],
};
export default hypitPackage;
