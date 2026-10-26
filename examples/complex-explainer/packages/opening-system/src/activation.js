import { installPortraitTransition } from "./portrait-transition.js";
import { installPortraitInset } from "./portrait-inset.js";
import { installReframe } from "./reframe.js";
import { installPullback } from "./pullback.js";
import { installPresenter } from "./presenter.js";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { assertAttributes, assertEmptyElement, createMarkupSurfaceFacet, textAttribute } from "@hypit/hypit/markup";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { sealGraphFragment } from "@hypit/hypit/author";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import { timelineTypes } from "@hypit/timeline";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { visualTrackModuleRef } from "@hypit/visual-track";
import {
  resolveTemporalWindowReference,
  resolveTemporalInstantReference,
  resolveTemporalContext,
  temporalWindowAttributeNames,
  temporalWindowAttributeVocabulary,
  temporalContextAttributeVocabulary,
} from "@hypit/temporal/markup";
import { renderTitle, renderTimer, renderFlag, renderStage, renderVeil } from "./render.js";
import { module, defaults } from "./definition.js";
import { studioFacet } from "./studio.js";
const type = (name) => ({ module, name });
const optionsType = type("Options"),
  itemsType = type("Items");
const producer = (name) => ({ module, name });
const port = (name, type) => ({ name, type });
const common = [
  port("timeline", timelineTypes.timeline),
  port("within", spatialTypes.frame),
  port("window", temporalTypes.window),
  port("options", optionsType),
];
export const manifest = {
  format: "hypit.module@1",
  ...module,
  dependencies: [
    ...new Map(
      [
        compositionTypes.visualTrack,
        mediaTypes.fontArtifact,
        mediaTypes.prepared,
        mediaTypes.blobArtifact,
        timelineTypes.timeline,
        spatialTypes.frame,
        temporalTypes.window,
        temporalTypes.duration, temporalTypes.extent, temporalTypes.shiftSpec,
        { module: visualTrackModuleRef, name: "VisualTrackProgram" },
      ].map((t) => [t.module.name, t.module]),
    ).values(),
  ],
  types: ["Options", "Items"],
  capabilities: [],
  producers: [
    {
      name: "title",
      inputs: [...common, port("font", mediaTypes.fontArtifact), port("bounce", temporalTypes.instant)],
      result: { kind: "output", ...port("track", compositionTypes.visualTrack) },
    },
    {
      name: "timer",
      inputs: [
        ...common,
        port("font", mediaTypes.fontArtifact),
        port("logo", mediaTypes.blobArtifact),
        port("stop", temporalTypes.instant),
      ],
      result: { kind: "output", ...port("track", compositionTypes.visualTrack) },
    },
    { name: "flag", inputs: [...common, port("logo", mediaTypes.blobArtifact)], result: { kind: "output", ...port("track", compositionTypes.visualTrack) } },
    {
      name: "veil",
      inputs: common,
      result: { kind: "output", ...port("track", compositionTypes.visualTrack) },
    },
    {
      name: "empty",
      inputs: [],
      result: { kind: "output", ...port("items", itemsType) },
    },
    ...["image", "video"].map((kind) => ({
      name: "append-" + kind,
      inputs: [
        port("items", itemsType),
        port("options", optionsType),
        port("window", temporalTypes.window),
        port(
          "asset",
          kind === "image" ? mediaTypes.blobArtifact : mediaTypes.prepared,
        ),
      ],
      result: { kind: "output", ...port("items", itemsType) },
    })),
    {
      name: "stage",
      inputs: [...common, port("items", itemsType)],
      result: { kind: "output", ...port("track", compositionTypes.visualTrack) },
    },
  ],
};
const valueOf = (r) => {
  if (!r) throw Error("Opening-system input is missing.");
  return r.value;
};
const val = (v) => ((canonicalize(v)));
const output = (_name, v) => ({ kind: "output", value: val(v) });
const component = {
  producers: [
    { producer: producer("flag"), handler: ({inputs: i}) => output("track", renderFlag(valueOf(i.timeline), valueOf(i.within), valueOf(i.window), valueOf(i.options), i.logo.value)) },
    ...[
      ["title", renderTitle],
      ["timer", renderTimer],
    ].map(([name, fn]) => ({
      producer: producer(name),
      handler: ({ inputs: i }) =>
        output(
          "track",
          fn(
            valueOf(i.timeline),
            valueOf(i.within),
            valueOf(i.window),
            valueOf(i.font),
            valueOf(i.options),
            name === "title" ? valueOf(i.bounce) : i.logo?.value,
            name === "timer" ? valueOf(i.stop) : undefined,
          ),
        ),
    })),
    {
      producer: producer("veil"),
      handler: ({ inputs: i }) =>
        output(
          "track",
          renderVeil(
            valueOf(i.timeline),
            valueOf(i.within),
            valueOf(i.window),
            valueOf(i.options),
          ),
        ),
    },
    { producer: producer("empty"), handler: () => output("items", []) },
    ...["image", "video"].map((kind) => ({
      producer: producer("append-" + kind),
      handler: ({ inputs: i }) =>
        output("items", [
          ...valueOf(i.items),
          {
            ...valueOf(i.options),
            window: valueOf(i.window),
            [kind === "image" ? "image" : "media"]:
              kind === "image" ? i.asset.value : valueOf(i.asset),
          },
        ]),
    })),
    {
      producer: producer("stage"),
      handler: ({ inputs: i }) =>
        output(
          "track",
          renderStage(
            valueOf(i.timeline),
            valueOf(i.within),
            valueOf(i.window),
            valueOf(i.items),
            valueOf(i.options),
          ),
        ),
    },
  ],
};
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function decode(kind) {
  return ({ element, resolveReference }) => {
    const values = defaults[kind];
    assertAttributes(element, [
      "id",
      "timeline",
      "within",
      ...(kind === "Title" ? ["bounce-at"] : []),
      ...(kind === "Timer" ? ["stop-at"] : []),
      ...(["Title", "Timer"].includes(kind) ? ["font"] : []),
      ...(["Timer", "Flag"].includes(kind) ? ["logo"] : []),
      ...Object.keys(values),
      ...temporalWindowAttributeNames,
    ]);
    const id = textAttribute(element, "id"),
      context = resolveTemporalContext({ element, resolveReference });
    const win = resolveTemporalWindowReference({ element, resolveReference });
    const ref = (el, name, t) => {
      const raw = el.attributes[name];
      if (typeof raw !== "object" || raw.kind !== "reference")
        throw Error(name + " must be a reference");
      const found = resolveReference(raw.path);
      if (!found || !sameType(found.type, t))
        throw Error(name + " has the wrong type");
      return found.ref;
    };
    const o = { id };
    for (const [name, d] of Object.entries(values)) {
      const raw = element.attributes[name];
      if (raw !== undefined && typeof raw !== "string")
        throw Error(name + " must be literal");
      const v = typeof d === "number" ? Number(raw ?? d) : (raw ?? d);
      if (typeof v === "number" && !Number.isFinite(v))
        throw Error(name + " must be finite");
      o[camel(name)] = v;
    }
    if (
      kind === "Stage" &&
      (!["contain", "cover"].includes(o.fit) ||
        o.width <= 0 ||
        o.height <= 0 ||
        o.brightness < 0 ||
        o.blur < 0 ||
        o.pushRate < 0)
    )
      throw Error(
        "Stage needs positive dimensions, contain/cover fit, and nonnegative background values.",
      );
    if (
      ["Title", "Timer"].includes(kind) &&
      (!Number.isSafeInteger(o.seconds) || o.seconds < 0)
    )
      throw Error("seconds must be a nonnegative integer");
    if (
      kind === "Timer" &&
      (!Number.isSafeInteger(o.entranceFrames) || o.entranceFrames < 1)
    )
      throw Error("entrance-frames must be positive");
    if (
      kind === "Veil" &&
      (!["mesh", "dots", "hatch"].includes(o.pattern) ||
        o.cell <= 0 ||
        o.amount < 0 ||
        o.amount > 1 ||
        o.shade < 0 ||
        o.shade > 1 ||
        !Number.isSafeInteger(o.fadeFrames) ||
        o.fadeFrames < 0)
    )
      throw Error(
        "Veil needs mesh/dots/hatch, positive cell size, opacity from zero to one, and a nonnegative fade frame count",
      );
    const records = [
        {
          id: id + ".options",
          type: optionsType,
          value: val(o),
          range: element.range,
        },
      ];
    const inputs = [...common],
      bindings = {
        timeline: context.timeline.ref,
        within: ref(element, "within", spatialTypes.frame),
        window: win.ref,
        options: { kind: "record", id: id + ".options" },
      };
    if (kind === "Title") {
      const bounce = resolveTemporalInstantReference({ element, resolveReference, attribute: "bounce-at" });
      inputs.push(port("bounce", temporalTypes.instant)); bindings.bounce = bounce.ref;
    }
    if (kind === "Timer") {
      const stop = resolveTemporalInstantReference({ element, resolveReference, attribute: "stop-at" });
      inputs.push(port("stop",temporalTypes.instant));bindings.stop=stop.ref;
    }
    const input = (name) => ({ kind: "fragment-input", name }),
      operation = (name) => ({ kind: "fragment-operation", operation: name });
    const operations = [];
    if (kind === "Stage") {
      operations.push({
        id: "empty",
        producer: producer("empty"),
        inputs: {},
        result: { kind: "output", name: "items" },
      });
      let previous = "empty",
        n = 0;
      for (const child of element.children) {
        if (child.kind === "text") {
          if (child.value.trim()) throw Error("Stage accepts Item children");
          continue;
        }
        if (child.name.split(":").at(-1) !== "Item")
          throw Error("Stage accepts Item children");
        assertAttributes(child, [
          "id",
          "image",
          "video",
          "source-start-frame",
          ...temporalWindowAttributeNames,
        ]);
        assertEmptyElement(child);
        const cid = textAttribute(child, "id"),
          isImage = child.attributes.image !== undefined;
        if (isImage === (child.attributes.video !== undefined))
          throw Error("Item needs exactly one image or prepared video");
        const iw = resolveTemporalWindowReference({ element: child, resolveReference });
        const key = "item" + ++n,
          optsId = id + "." + key,
          sourceStart = Number(child.attributes["source-start-frame"] ?? 0);
        if (!Number.isSafeInteger(sourceStart) || sourceStart < 0)
          throw Error("source-start-frame must be nonnegative integer");
        records.push({
          id: optsId,
          type: optionsType,
          value: val({ id: cid, sourceStart }),
          range: child.range,
        });
        for (const [suffix, t, r] of [
          ["options", optionsType, { kind: "record", id: optsId }],
          ["window", temporalTypes.window, iw.ref],
          [
            "asset",
            isImage ? mediaTypes.blobArtifact : mediaTypes.prepared,
            ref(
              child,
              isImage ? "image" : "video",
              isImage ? mediaTypes.blobArtifact : mediaTypes.prepared,
            ),
          ],
        ]) {
          inputs.push(port(key + "-" + suffix, t));
          bindings[key + "-" + suffix] = r;
        }
        operations.push({
          id: key,
          producer: producer(isImage ? "append-image" : "append-video"),
          inputs: {
            items: operation(previous),
            options: input(key + "-options"),
            window: input(key + "-window"),
            asset: input(key + "-asset"),
          },
          result: { kind: "output", name: "items" },
        });
        previous = key;
      }
      if (!n) throw Error("Stage needs Item children");
      operations.push({
        id: "render",
        producer: producer("stage"),
        inputs: {
          ...Object.fromEntries(common.map((p) => [p.name, input(p.name)])),
          items: operation(previous),
        },
        result: { kind: "output", name: "track" },
      });
    } else {
      assertEmptyElement(element);
      if (["Title", "Timer"].includes(kind)) {
        inputs.push(port("font", mediaTypes.fontArtifact));
        bindings.font = ref(element, "font", mediaTypes.fontArtifact);
      }
      if (["Timer", "Flag"].includes(kind)) {
        inputs.push(port("logo", mediaTypes.blobArtifact));
        bindings.logo = ref(element, "logo", mediaTypes.blobArtifact);
      }
      operations.push({
        id: "render",
        producer: producer(kind.toLowerCase()),
        inputs: Object.fromEntries(inputs.map((p) => [p.name, input(p.name)])),
        result: { kind: "output", name: "track" },
      });
    }
    const fragment = sealGraphFragment({
      inputs,
      operations,
      exports: [
        {
          name: "visual",
          type: compositionTypes.visualTrack,
          root: operation("render"),
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
const declarations = Object.keys(defaults).map((tag) => ({
  name: tag.toLowerCase(),
  tag,
  mode: "structured",
  outputs: [
    optionsType,
    itemsType,
    compositionTypes.visualTrack,
  ],
  vocabulary: {
    summary: {
      Flag: "An independent foreshortened cloth flag beneath the composition.",
      Veil: "An independent patterned veil placed above footage and below foreground graphics.",
      Title:
        "Transparent opening clock and two-level headline in a pink window card.",
      Timer:
        "Persistent topic plaque with a countdown that turns coral and counts overtime.",
      Stage:
        "Clear foreground media with the same moving picture enlarged, blurred and dimmed behind it.",
    }[tag],
    attributes: [
      ...(tag === "Title" ? [{ name: "bounce-at", kind: "reference", required: true, accepts: [temporalTypes.instant], summary: "Resolved Instant when the title jumps." }] : []),
      ...(tag === "Timer" ? [{name:"stop-at",kind:"reference",required:true,accepts:[temporalTypes.instant],summary:"Resolved Instant that freezes the overtime display and flashes."}] : []),
      ...temporalContextAttributeVocabulary,
      ...temporalWindowAttributeVocabulary,
      ...[
        "id",
        "within",
        ...(["Title", "Timer"].includes(tag) ? ["font"] : []),
        ...(["Timer", "Flag"].includes(tag) ? ["logo"] : []),
      ].map((name) => ({
        name,
        kind: "expression",
        required: true,
        summary: name,
      })),
      ...Object.keys(defaults[tag]).map((name) => ({
        name,
        kind: "literal",
        required: false,
        summary: `${name}; default ${defaults[tag][name]}`,
      })),
    ],
    children:
      tag === "Stage"
        ? [
            {
              tag: "Item",
              cardinality: "many",
              summary:
                "Image or prepared video, in its own projected Window. Later items paint above earlier items.",
              attributes: [
                {
                  name: "id",
                  kind: "identifier",
                  required: true,
                  summary: "Item identity",
                },
                {
                  name: "image",
                  kind: "expression",
                  required: false,
                  summary: "Image artifact",
                },
                {
                  name: "video",
                  kind: "expression",
                  required: false,
                  summary: "Prepared moving media",
                },
                {
                  name: "source-start-frame",
                  kind: "literal",
                  required: false,
                  summary: "First source frame, default zero",
                },
                ...temporalWindowAttributeVocabulary,
              ],
            },
          ]
        : [],
    ports: [
      {
        name: "visual",
        type: compositionTypes.visualTrack,
        summary: "Visual contribution, explicitly connected to Film",
      },
    ],
  },
}));
const pullback = installPullback(module, manifest, component, optionsType);
const fadeOut = installPullback(module, manifest, component, optionsType, "fade-out");
const reframe = installReframe(module, manifest, component);
const portraitTransition = installPortraitTransition(module, manifest, component);
const portraitInset = installPortraitInset(module, manifest, component);
const presenter = installPresenter(module, manifest, component);
export const hypitPackage = {
  format: "hypit.package@1",
  modules: [{ manifest }],
  facets: [
    createProducerPackageFacet(component.producers ?? []),
    createRefinementPackageFacet(component.refinements ?? []),
    ...declarations.map((declaration) =>
      createMarkupSurfaceFacet({
        module,
        declaration,
        handler: decode(declaration.tag),
      }),
    ),
    pullback,
    fadeOut,
    reframe,
    portraitTransition,
    portraitInset,
    presenter.styleFacet,
    presenter.presenterFacet,
    studioFacet,
  ],
};
export default hypitPackage;
