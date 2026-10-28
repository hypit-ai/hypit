import { installPortraitTransition } from "./portrait-transition.js";
import { installPortraitInset } from "./portrait-inset.js";
import { installReframe } from "./reframe.js";
import { installPullback } from "./pullback.js";
import { installPresenter } from "./presenter.js";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { createAuthorDeclarationFacet, declarationField, sealGraphFragment } from "@hypit/hypit/author";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import { timelineTypes } from "@hypit/timeline";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { visualTrackModuleRef } from "@hypit/visual-track";
import {
  resolveAuthorWindow,
  resolveAuthorInstant,
  resolveAuthorTimeline,
  temporalWindowFieldShape,
  temporalContextFieldShape,
  temporalInstantFieldShape,
} from "@hypit/temporal/author";
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
const literal = (element, name, required = true) => {
  const field = declarationField(element, name);
  if (field === undefined && !required) return undefined;
  if (field?.kind !== "literal" || !field.value.trim()) throw Error(`${element.name}.${name} must be text`);
  return field.value.trim();
};
const resolved = async (element, name, type, resolveReference) => {
  const field = declarationField(element, name);
  if (field?.kind !== "reference") throw Error(`${element.name}.${name} must be a reference`);
  const found = await resolveReference(field.path);
  if (!found || !sameType(found.type, type)) throw Error(`${element.name}.${name} has the wrong type`);
  return found;
};
function compiler(kind) {
  const values = defaults[kind];
  return {
    module,
    declaration: kind.toLowerCase(),
    outputs: [optionsType, itemsType, compositionTypes.visualTrack],
    shape: {
      summary: {
        Flag: "An independent foreshortened cloth flag beneath the composition.",
        Veil: "An independent patterned veil placed above footage and below foreground graphics.",
        Title: "Transparent opening clock and two-level headline in a pink window card.",
        Timer: "Persistent topic plaque with a countdown that turns coral and counts overtime.",
        Stage: "Clear foreground media with the same moving picture enlarged, blurred and dimmed behind it.",
      }[kind],
      fields: [
        { name: "id", kind: "identifier", required: true, summary: "Declaration identity." },
        temporalContextFieldShape,
        temporalWindowFieldShape,
        { name: "within", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Picture frame." },
        ...(kind === "Title" ? [{ ...temporalInstantFieldShape, name: "bounce-at", summary: "Resolved Instant when the title jumps." }] : []),
        ...(kind === "Timer" ? [{ ...temporalInstantFieldShape, name: "stop-at", summary: "Resolved Instant that freezes the overtime display and flashes." }] : []),
        ...(["Title", "Timer"].includes(kind) ? [{ name: "font", kind: "reference", required: true, accepts: [mediaTypes.fontArtifact], summary: "Font." }] : []),
        ...(["Timer", "Flag"].includes(kind) ? [{ name: "logo", kind: "reference", required: true, accepts: [mediaTypes.blobArtifact], summary: "Logo." }] : []),
        ...Object.keys(values).map((name) => ({ name, kind: "literal", required: false, summary: `${name}; default ${values[name]}` })),
      ],
      children: kind === "Stage" ? [{ name: "Item", cardinality: "many", summary: "Image or prepared video, in its own projected Window. Later items paint above earlier items.", fields: [
        { name: "id", kind: "identifier", required: true, summary: "Item identity" },
        { name: "image", kind: "reference", required: false, accepts: [mediaTypes.blobArtifact], summary: "Image artifact" },
        { name: "video", kind: "reference", required: false, accepts: [mediaTypes.prepared], summary: "Prepared moving media" },
        { name: "source-start-frame", kind: "literal", required: false, summary: "First source frame, default zero" },
        temporalWindowFieldShape,
      ] }] : [],
    },
    bindings(element) {
      const id = literal(element, "id");
      return [{ name: `${id}.visual`, ref: { kind: "component-output", component: id, output: "visual" }, type: compositionTypes.visualTrack }];
    },
    async compile({ declaration: element, resolveReference }) {
    const id = literal(element, "id"),
      timeline = await resolveAuthorTimeline(element, resolveReference),
      win = await resolveAuthorWindow(element, resolveReference);
    const o = { id };
    for (const [name, d] of Object.entries(values)) {
      const raw = declarationField(element, name);
      if (raw !== undefined && raw.kind !== "literal")
        throw Error(name + " must be literal");
      const authored = raw?.value;
      const v = typeof d === "number" ? Number(authored ?? d) : (authored ?? d);
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
        timeline: timeline.ref,
        within: (await resolved(element, "within", spatialTypes.frame, resolveReference)).ref,
        window: win.ref,
        options: { kind: "record", id: id + ".options" },
      };
    if (kind === "Title") {
      const bounce = await resolveAuthorInstant(element, resolveReference, "bounce-at");
      inputs.push(port("bounce", temporalTypes.instant)); bindings.bounce = bounce.ref;
    }
    if (kind === "Timer") {
      const stop = await resolveAuthorInstant(element, resolveReference, "stop-at");
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
        if (child.name !== "Item")
          throw Error("Stage accepts Item children");
        const cid = literal(child, "id"),
          image = declarationField(child, "image"),
          video = declarationField(child, "video"),
          isImage = image !== undefined;
        if (isImage === (video !== undefined))
          throw Error("Item needs exactly one image or prepared video");
        const iw = await resolveAuthorWindow(child, resolveReference);
        const key = "item" + ++n,
          optsId = id + "." + key,
          sourceStartField = declarationField(child, "source-start-frame"),
          sourceStart = Number(sourceStartField?.value ?? 0);
        if (sourceStartField !== undefined && sourceStartField.kind !== "literal")
          throw Error("source-start-frame must be literal");
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
            (await resolved(child, isImage ? "image" : "video", isImage ? mediaTypes.blobArtifact : mediaTypes.prepared, resolveReference)).ref,
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
      if (["Title", "Timer"].includes(kind)) {
        inputs.push(port("font", mediaTypes.fontArtifact));
        bindings.font = (await resolved(element, "font", mediaTypes.fontArtifact, resolveReference)).ref;
      }
      if (["Timer", "Flag"].includes(kind)) {
        inputs.push(port("logo", mediaTypes.blobArtifact));
        bindings.logo = (await resolved(element, "logo", mediaTypes.blobArtifact, resolveReference)).ref;
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
    };
  },
  };
}
const declarations = Object.keys(defaults).map(compiler);
const markupDeclarations = Object.keys(defaults).map((tag) => ({ name: tag.toLowerCase(), tag }));
const pullback = installPullback(module, manifest, component, optionsType);
const fadeOut = installPullback(module, manifest, component, optionsType, "fade-out");
const reframe = installReframe(module, manifest, component);
const portraitTransition = installPortraitTransition(module, manifest, component);
const portraitInset = installPortraitInset(module, manifest, component);
const presenter = installPresenter(module, manifest, component);
const styles = [pullback, fadeOut, reframe, portraitTransition, portraitInset];
export const hypitPackage = {
  format: "hypit.package@1",
  modules: [{ manifest }],
  facets: [
    createProducerPackageFacet(component.producers ?? []),
    createRefinementPackageFacet(component.refinements ?? []),
    ...[
      ...declarations,
      ...styles.map((style) => style.declaration),
      ...presenter.declarations,
    ].map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...[...markupDeclarations, ...styles.map((style) => style.markup), ...presenter.markup]
      .map((declaration) => createMarkupDeclarationFacet({ module, declaration })),
    studioFacet,
  ],
};
export default hypitPackage;
