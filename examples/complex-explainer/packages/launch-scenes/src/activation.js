import { sceneCompanions } from "./studio.js";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createStudioTrackCompanionFacet } from "@hypit/studio-companion";
import { assertAttributes, assertEmptyElement, textAttribute, createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { sealGraphFragment } from "@hypit/hypit/author";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import { timelineTypes } from "@hypit/timeline";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes, assertTemporalInstantFor } from "@hypit/temporal";
import {
  resolveTemporalContext,
  resolveTemporalWindowReference,
  resolveTemporalInstantReference,
  temporalWindowAttributeNames,
  temporalWindowAttributeVocabulary,
  temporalContextAttributeVocabulary,
  temporalInstantAttributeNames,
  temporalInstantAttributeVocabulary,
} from "@hypit/temporal/markup";
import { renderPoster } from "./render.js";
const module = { name: "@explainer/launch-scenes", version: "1" },
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
  PosterTitle: {
    name: "poster",
    render: renderPoster,
    assets: [],
    defaults: {
      text: "Hypit",
      subtitle: "",
      z: 45,
      y: 0.18,
      size: 180,
      "subtitle-size": 44,
      "subtitle-gap": 36,
    },
  },
};
const ins = (tag) => [...common, ...tags[tag].assets.map((n) => port(n, mediaTypes.blobArtifact))];
export const manifest = {
  format: "hypit.module@1",
  ...module,
  dependencies: [
    ...new Map(
      [
        compositionTypes.visualTrack,
        mediaTypes.fontArtifact,
        mediaTypes.blobArtifact,
        timelineTypes.timeline,
        spatialTypes.frame,
        temporalTypes.window,
        temporalTypes.instant,
        temporalTypes.duration, temporalTypes.extent, temporalTypes.shiftSpec,
      ].map((t) => [t.module.name, { module: t.module }]),
    ).values(),
  ],
  types: [{ name: "Options" }, { name: "Events" }],
  capabilities: [],
  producers: [
    { name: "empty", inputs: [], outputs: [port("events", events)], needs: [] },
    {
      name: "append",
      inputs: [
        port("timeline", timelineTypes.timeline),
        port("events", events),
        port("options", options),
        port("at", temporalTypes.instant),
      ],
      outputs: [port("events", events)],
      needs: [],
    },
    ...Object.keys(tags).map((tag) => ({
      name: tags[tag].name,
      inputs: ins(tag),
      outputs: [port("track", compositionTypes.visualTrack)],
      needs: [],
    })),
  ],
};
const valueOf = (r) => {
    if (!r) throw Error("Expected scene value");
    return r.value;
  },
  value = (v) => ((canonicalize(v))),
  out = (n, v) => ({ outputs: { [n]: value(v) }, needs: {} });
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
function decode(tag) {
  return ({ element, resolveReference }) => {
    const spec = tags[tag];
    assertAttributes(element, [
      "id",
      "timeline",
      "within",
      "font",
      ...spec.assets,
      ...Object.keys(spec.defaults),
      ...temporalWindowAttributeNames,
    ]);
    const id = textAttribute(element, "id"),
      context = resolveTemporalContext({ element, resolveReference }),
      window = resolveTemporalWindowReference({ element, resolveReference });
    const ref = (el, n, t) => {
      const raw = el.attributes[n];
      if (typeof raw !== "object" || raw.kind !== "reference")
        throw Error(n + " must be a reference");
      const r = resolveReference(raw.path);
      if (!r || !sameType(r.type, t)) throw Error(n + " has wrong type");
      return r.ref;
    };
    const opts = { id };
    for (const [n, d] of Object.entries(spec.defaults)) {
      const v = element.attributes[n];
      if (v !== undefined && typeof v !== "string") throw Error(n + " must be literal");
      opts[n] = typeof d === "number" ? Number(v ?? d) : (v ?? d);
    }
    if (!Number.isSafeInteger(opts.z)) throw Error("z must be integer");
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
        timeline: context.timeline.ref,
        within: ref(element, "within", spatialTypes.frame),
        window: window.ref,
        font: ref(element, "font", mediaTypes.fontArtifact),
        options: { kind: "record", id: id + ".options" },
      };
    for (const n of spec.assets) bindings[n] = ref(element, n, mediaTypes.blobArtifact);
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
      if (ch.kind === "text") {
        if (ch.value.trim()) throw Error("Expected Beat");
        continue;
      }
      if (ch.name.split(":").at(-1) !== "Beat") throw Error("Expected Beat");
      assertAttributes(ch, ["name", ...temporalInstantAttributeNames]);
      assertEmptyElement(ch);
      const name = textAttribute(ch, "name"),
        key = "beat" + ++count,
        eid = id + "." + key,
        at = resolveTemporalInstantReference({ element: ch, resolveReference });
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
      exports: [id + ".visual"],
    };
  };
}
export const hypitPackage = {
  format: "hypit.package@1",
  modules: [{ manifest }],
  facets: [
    createProducerPackageFacet(component),
    createRefinementPackageFacet(component),
    createStudioTrackCompanionFacet(sceneCompanions(module, tags)),
    ...Object.keys(tags).map((tag) =>
      createMarkupSurfaceFacet({
        module,
        declaration: {
          name: tags[tag].name,
          tag,
          mode: "structured",
          outputs: [
            options,
            events,
            compositionTypes.visualTrack,
          ],
          vocabulary: {
            summary: "Project launch scene with phrase-driven visual beats.",
            attributes: [
              ...temporalContextAttributeVocabulary,
              ...temporalWindowAttributeVocabulary,
              ...["id", "within", "font", ...tags[tag].assets].map((name) => ({
                name,
                kind: "expression",
                required: true,
                summary: name,
              })),
              ...Object.keys(tags[tag].defaults).map((name) => ({
                name,
                kind: "literal",
                required: false,
                summary: name,
              })),
            ],
            children: [
              {
                tag: "Beat",
                cardinality: "many",
                summary: "Named absolute event in the scene, produced upstream by semantic or direct time authoring.",
                attributes: [
                  {
                    name: "name",
                    kind: "literal",
                    required: true,
                    summary: "Behavioral event name",
                  },
                  ...temporalInstantAttributeVocabulary,
                ],
              },
            ],
            ports: [
              {
                name: "visual",
                type: compositionTypes.visualTrack,
                summary: "Visual contribution",
              },
            ],
          },
        },
        handler: decode(tag),
      }),
    ),
  ],
};
export default hypitPackage;
