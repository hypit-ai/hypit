import { sameType } from "@hypit/hypit/module";
import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { createMarkupDeclarationFacet } from "@hypit/hypit/generation/markup";
import { canonicalize } from "@hypit/hypit/value";
import { createAuthorDeclarationFacet, declarationField, sealGraphFragment } from "@hypit/hypit/generation/author";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import { timelineTypes, assertTemporalInstantFor } from "@hypit/timeline";
import { timelineAuthorTypes } from "@hypit/timeline-author";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { resolveTimelineReference, resolveWindowReference, resolveInstantReference,
  timelineContextFieldShape, timelineWindowFieldShape, timelineInstantFieldShape } from "@hypit/timeline-author/reference";
import { renderPoster } from "./render.js";
const module = { name: "@explainer/launch-scenes" },
  type = (name) => ({ module, name }),
  producer = (name) => ({ module, name }),
  port = (name, type) => ({ name, type });
const options = type("Options"),
  events = type("Events");
const common = [
  port("timeline", timelineTypes.timeline),
  port("within", spatialTypes.frame),
  port("window", timelineTypes.window),
  port("font", mediaTypes.fontArtifact),
  port("options", options),
  port("events", events),
];
const tags = {
  PosterTitle: {
    name: "poster",
    render: renderPoster,
    assets: [],
    defaults: {
      text: "Hypit",
      subtitle: "",
      y: 0.18,
      size: 180,
      "subtitle-size": 44,
      "subtitle-gap": 36,
    },
  },
};
const ins = (tag) => [...common, ...tags[tag].assets.map((n) => port(n, mediaTypes.blobArtifact))];
export const manifest = {
  ...module,
  dependencies: [
    ...new Map(
      [
        compositionTypes.visualTrack,
        mediaTypes.fontArtifact,
        mediaTypes.blobArtifact,
        timelineTypes.timeline,
        spatialTypes.frame,
        timelineTypes.window,
        timelineTypes.instant,
        temporalTypes.duration, temporalTypes.extent, timelineAuthorTypes.shiftSpec,
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
        port("at", timelineTypes.instant),
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
            Object.fromEntries(tags[tag].assets.map((n) => [n, i[n].value])),
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
      summary: "Project launch scene with phrase-driven visual beats.",
      fields: [
        { name: "id", kind: "identifier", required: true, summary: "Names the scene." },
        timelineContextFieldShape,
        timelineWindowFieldShape,
        { name: "within", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Places the scene." },
        { name: "font", kind: "reference", required: true, accepts: [mediaTypes.fontArtifact], summary: "Selects its font." },
        ...spec.assets.map((name) => ({ name, kind: "reference", required: true, accepts: [mediaTypes.blobArtifact], summary: name })),
        ...Object.keys(spec.defaults).map((name) => ({ name, kind: "literal", required: false, summary: name })),
      ],
      children: [{ name: "Beat", cardinality: "many", summary: "One named absolute scene event.", fields: [
        { name: "name", kind: "literal", required: true, summary: "Behavioral event name." }, timelineInstantFieldShape,
      ] }],
    },
    bindings(declaration) {
      const id = literal(declaration, "id");
      return [{ name: `${id}.visual`, ref: { kind: "component-output", component: id, output: "visual" }, type: compositionTypes.visualTrack }];
    },
    async compile({ declaration: element, resolveReference }) {
    const spec = tags[tag];
    const id = literal(element, "id"),
      timeline = await resolveTimelineReference(element, resolveReference),
      window = await resolveWindowReference(element, resolveReference);
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
    const inputs = ins(tag).filter((p) => p.name !== "events"),
      bindings = {
        timeline: timeline.ref,
        within: (await resolved(element, "within", spatialTypes.frame, resolveReference)).ref,
        window: window.ref,
        font: (await resolved(element, "font", mediaTypes.fontArtifact, resolveReference)).ref,
        options: { kind: "record", id: id + ".options" },
      };
    for (const n of spec.assets) bindings[n] = (await resolved(element, n, mediaTypes.blobArtifact, resolveReference)).ref;
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
        at = await resolveInstantReference(ch, resolveReference);
      records.push({
        id: eid + ".options",
        type: options,
        value: value({ id: eid, name }),
        range: ch.range,
      });
      inputs.push(port(key, options), port(key + "-at", timelineTypes.instant));
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
  facets: [
    createModuleFacet(manifest),
    createGenerationModuleFacet(manifest),
    createProducerPackageFacet(component.producers ?? []),
    createRefinementPackageFacet(component.refinements ?? []),
    ...declarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...Object.entries(tags).map(([tag, spec]) => createMarkupDeclarationFacet({
      module, declaration: { name: spec.name, tag, body: "structured" },
    })),
  ],
};
export default hypitPackage;
