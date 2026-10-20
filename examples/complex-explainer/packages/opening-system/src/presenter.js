import { assertAttributes, assertEmptyElement, createMarkupSurfaceFacet, optionalTextAttribute, textAttribute } from "@hypit/hypit/markup";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { sealGraphFragment } from "@hypit/hypit/author";
import { compositionTypes, sealVisualTrack } from "@hypit/composition";
import { mediaTypes, verifySynchronizedMedia } from "@hypit/media";
import { spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/hypit/recipe";
import { temporalTypes, assertTemporalWindowFor } from "@hypit/temporal";
import {
  resolveTemporalWindowReference,
  resolveTemporalContext,
  temporalWindowAttributeNames,
  temporalWindowAttributeVocabulary,
} from "@hypit/temporal/markup";
import { timelineTypes } from "@hypit/timeline";
import {
  appendVisualClip,
  appendTimedMediaLayer,
  createMediaLayerSet,
  createVisualTrackSet,
  decodeMediaFit,
  decodeVisualClipSpec,
  decodeMediaSampleSpec,
  finalizeVisualTrack,
  visualMaterialKeys,
  projectVisualTrack,
  visualTrackTypes,
} from "@hypit/visual-track";

const input = (name) => ({ kind: "fragment-input", name });
const operation = (id) => ({ kind: "fragment-operation", operation: id });
const valueOf = (record, label) => {
  if (!record) throw Error(`${label} is missing.`);
  return record.value;
};
const stored = (value) => ((canonicalize(value)));

export function presenterTypes(module) {
  return {
    style: { module, name: "PresenterStyle" },
    sourceSpec: { module, name: "PresenterSourceSpec" },
    sources: { module, name: "PresenterSources" },
    program: { module, name: "PresenterProgram" },
    header: { module, name: "PresenterHeader" },
  };
}

export function presenterStyle(fragment, bindings = {}) {
  return { fragment: sealGraphFragment(fragment), bindings };
}

function sourceValue(spec, media, window, timeline) {
  verifySynchronizedMedia(media);
  assertTemporalWindowFor(window, { timeline });
  if (media.visual === undefined) throw Error(`Presenter Source ${spec.id} has no visual stream.`);
  return { id: spec.id, media: structuredClone(media), window: structuredClone(window) };
}

function sourcesValue(sources) {
  const ids = new Set();
  for (const source of sources) {
    if (ids.has(source.id)) throw Error(`Presenter repeats Source ${source.id}.`);
    ids.add(source.id);
  }
  return { sources: structuredClone(sources) };
}

function intersect(left, right) {
  return left.flatMap((a) => right.flatMap((b) => {
    const startFrame = Math.max(a.startFrame, b.startFrame);
    const endFrameExclusive = Math.min(a.endFrameExclusive, b.endFrameExclusive);
    return endFrameExclusive > startFrame ? [{ startFrame, endFrameExclusive }] : [];
  }));
}

function resolvePresenter(timeline, id, program) {
  const presents = [];
  for (const [index, use] of program.uses.entries()) {
    assertTemporalWindowFor(use.window, { timeline });
    let visible = [use.window.span];
    for (const later of program.uses.slice(index + 1)) {
      visible = visible.flatMap((span) => {
        const cut = later.window.span;
        if (cut.endFrameExclusive <= span.startFrame || cut.startFrame >= span.endFrameExclusive) return [span];
        return [
          ...(cut.startFrame > span.startFrame ? [{ startFrame: span.startFrame, endFrameExclusive: cut.startFrame }] : []),
          ...(cut.endFrameExclusive < span.endFrameExclusive ? [{ startFrame: cut.endFrameExclusive, endFrameExclusive: span.endFrameExclusive }] : []),
        ];
      });
    }
    for (const present of use.visual.presents) {
      const visibility = intersect(visible, present.visibility ?? [present.span]);
      if (visibility.length > 0) presents.push({
        ...present,
        id: `${id}:${use.window.subjectId}:${present.id}`,
        visibility,
      });
    }
  }
  return sealVisualTrack({ id, timelineId: timeline.id, visualIr: "hypit.visual-ir@1", presents });
}

function ordinaryPresenter(timeline, window, frame, sources, fit, sample, spec) {
  const layers = [];
  for (const source of sources.sources) {
    const startFrame = Math.max(source.window.span.startFrame, window.span.startFrame);
    const availableEndFrameExclusive = source.window.span.startFrame + source.media.frameDomain.frameCount;
    const endFrameExclusive = Math.min(
      source.window.span.endFrameExclusive,
      window.span.endFrameExclusive,
      availableEndFrameExclusive,
    );
    if (endFrameExclusive <= startFrame) continue;
    const sourceStartFrame = startFrame - source.window.span.startFrame;
    const [layer] = appendTimedMediaLayer(createMediaLayerSet(), source.media, fit, {
      ...sample,
      id: `${window.subjectId}:${source.id}`,
    }).layers;
    layers.push({
      ...layer,
      sourceTime: { kind: "map", value: {
        sourceFrameRate: source.media.frameDomain.frameRate,
        sourceFrameCount: source.media.frameDomain.frameCount,
        pieces: [{
          target: { startFrame: startFrame - window.span.startFrame, endFrameExclusive: endFrameExclusive - window.span.startFrame },
          sourceAtStart: { numerator: sourceStartFrame, denominator: 1 },
          rate: { numerator: 1, denominator: 1 },
        }],
      } },
    });
  }
  if (layers.length === 0) return sealVisualTrack({ id: window.subjectId, timelineId: timeline.id, visualIr: "hypit.visual-ir@1", presents: [] });
  const header = { id: window.subjectId };
  const set = appendVisualClip(createVisualTrackSet(), header, timeline, { layers }, frame, { ...spec, id: window.subjectId }, window);
  return projectVisualTrack(timeline, finalizeVisualTrack(set, header, timeline));
}

function ref(element, name, type, resolveReference) {
  const raw = element.attributes[name];
  if (raw?.kind !== "reference") throw Error(`${element.name}.${name} must be a reference.`);
  const value = resolveReference(raw.path);
  if (!value || !sameType(value.type, type)) throw Error(`${element.name}.${name} has the wrong Type.`);
  return value;
}

function authored(value, label) {
  if (!value.record) throw Error(`${label} must be an authored value.`);
  return value.record.value;
}

export function installPresenter(module, manifest, component) {
  const types = presenterTypes(module);
  manifest.types.push(...Object.values(types).map((type) => ({ name: type.name })));
  const producers = {
    source: { module, name: "presenter-source" },
    combineSources: { module, name: "combine-presenter-sources" },
    create: { module, name: "create-presenter-program" },
    append: { module, name: "append-presenter-use" },
    resolve: { module, name: "resolve-presenter" },
    ordinary: { module, name: "ordinary-presenter" },
  };
  const common = [
    { name: "timeline", type: timelineTypes.timeline },
    { name: "window", type: temporalTypes.window },
    { name: "sources", type: types.sources },
  ];
  manifest.producers.push(
    { name: producers.source.name, inputs: [
      { name: "spec", type: types.sourceSpec }, { name: "media", type: mediaTypes.synchronized },
      { name: "window", type: temporalTypes.window }, { name: "timeline", type: timelineTypes.timeline },
    ], outputs: [{ name: "sources", type: types.sources }], needs: [] },
    { name: producers.combineSources.name, inputs: [{ name: "left", type: types.sources }, { name: "right", type: types.sources }], outputs: [{ name: "sources", type: types.sources }], needs: [] },
    { name: producers.create.name, inputs: [], outputs: [{ name: "program", type: types.program }], needs: [] },
    { name: producers.append.name, inputs: [{ name: "program", type: types.program }, { name: "window", type: temporalTypes.window }, { name: "visual", type: compositionTypes.visualTrack }], outputs: [{ name: "program", type: types.program }], needs: [] },
    { name: producers.resolve.name, inputs: [{ name: "program", type: types.program }, { name: "timeline", type: timelineTypes.timeline }, { name: "header", type: types.header }], outputs: [{ name: "visual", type: compositionTypes.visualTrack }], needs: [] },
  );
  component.producers.push(
    { producer: producers.source, handler: ({ inputs }) => ({ outputs: { sources: stored(sourcesValue([sourceValue(valueOf(inputs.spec, "PresenterSourceSpec"), valueOf(inputs.media, "SynchronizedMedia"), valueOf(inputs.window, "TemporalWindow"), valueOf(inputs.timeline, "Timeline"))])) }, needs: {} }) },
    { producer: producers.combineSources, handler: ({ inputs }) => ({ outputs: { sources: stored(sourcesValue([...valueOf(inputs.left, "PresenterSources").sources, ...valueOf(inputs.right, "PresenterSources").sources])) }, needs: {} }) },
    { producer: producers.create, handler: () => ({ outputs: { program: stored({ uses: [] }) }, needs: {} }) },
    { producer: producers.append, handler: ({ inputs }) => ({ outputs: { program: stored({ uses: [...valueOf(inputs.program, "PresenterProgram").uses, { window: valueOf(inputs.window, "TemporalWindow"), visual: valueOf(inputs.visual, "VisualTrack") }] }) }, needs: {} }) },
    { producer: producers.resolve, handler: ({ inputs }) => ({ outputs: { visual: stored(resolvePresenter(valueOf(inputs.timeline, "Timeline"), valueOf(inputs.header, "PresenterHeader").id, valueOf(inputs.program, "PresenterProgram"))) }, needs: {} }) },
  );

  const ordinaryInputs = [...common, { name: "frame", type: spatialTypes.frame }, { name: "fit", type: spatialTypes.fit },
    { name: "sample", type: visualTrackTypes.sampleLayerSpec },
    { name: "spec", type: visualTrackTypes.clipSpec }];
  manifest.producers.push({ name: producers.ordinary.name, inputs: ordinaryInputs, outputs: [{ name: "visual", type: compositionTypes.visualTrack }], needs: [] });
  component.producers.push({ producer: producers.ordinary, handler: ({ inputs }) => ({ outputs: { visual: stored(ordinaryPresenter(
    valueOf(inputs.timeline, "Timeline"), valueOf(inputs.window, "TemporalWindow"),
    valueOf(inputs.frame, "SpatialFrame"), valueOf(inputs.sources, "PresenterSources"), valueOf(inputs.fit, "ContentFit"),
    valueOf(inputs.sample, "MediaSampleLayerSpec"), valueOf(inputs.spec, "VisualClipSpec"),
  )) }, needs: {} }) });
  const ordinaryFragment = sealGraphFragment({ inputs: ordinaryInputs, operations: [{ id: "render", producer: producers.ordinary,
    inputs: Object.fromEntries(ordinaryInputs.map((port) => [port.name, input(port.name)])), result: { kind: "output", name: "visual" } }],
  exports: [{ name: "visual", type: compositionTypes.visualTrack, root: operation("render") }] });

  const styleFacet = createMarkupSurfaceFacet({ module, declaration: {
    name: "presenter-frame-style", tag: "PresenterFrame", mode: "structured", outputs: [
      types.style,
      spatialTypes.fit,
      visualTrackTypes.sampleLayerSpec,
      visualTrackTypes.clipSpec,
    ],
    vocabulary: { summary: "Project presenter framing treatment.", attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Treatment identity." },
      { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Presenter viewport." },
      { name: "appearance", kind: "reference", required: true, accepts: [recipeType], summary: "Presenter media appearance." },
    ] },
  }, handler: ({ element, resolveReference }) => {
    assertAttributes(element, ["id", "frame", "appearance"]); assertEmptyElement(element);
    const id = textAttribute(element, "id");
    const frame = ref(element, "frame", spatialTypes.frame, resolveReference);
    const recipeValue = authored(ref(element, "appearance", recipeType, resolveReference), "Presenter appearance");
    const records = [];
    const bind = (name, type, value) => {
      const recordId = `${id}.${name}`;
      records.push({ id: recordId, type, value: stored(value), range: element.range });
      return { ref: { kind: "record", id: recordId }, type };
    };
    const sampleType = ordinaryInputs.find((port) => port.name === "sample").type;
    const specType = ordinaryInputs.find((port) => port.name === "spec").type;
    const selectedRecipe = (keys) => ({
      ...recipeValue,
      properties: Object.fromEntries(Object.entries(recipeValue.properties).filter(([name]) => keys.includes(name))),
    });
    const stackingOrder = recipeValue.properties["stack-order"];
    if (!Number.isSafeInteger(stackingOrder)) throw Error(`Presenter appearance ${recipeValue.path} requires integer stack-order.`);
    const sampleKeys = [...visualMaterialKeys.fit, ...visualMaterialKeys.sample, ...visualMaterialKeys.frame];
    const treatmentKeys = [...visualMaterialKeys.sample, ...visualMaterialKeys.frame];
    const style = presenterStyle(ordinaryFragment, {
      frame,
      fit: bind("fit", spatialTypes.fit, decodeMediaFit(selectedRecipe(visualMaterialKeys.fit))),
      sample: bind("sample", sampleType, decodeMediaSampleSpec(selectedRecipe(sampleKeys), "content", "timed", undefined, true)),
      spec: bind("spec", specType, decodeVisualClipSpec(selectedRecipe(treatmentKeys), { id, z: stackingOrder })),
    });
    records.push({ id, type: types.style, value: stored(style), range: element.range });
    return { records, components: [] };
  } });

  const presenterFacet = createMarkupSurfaceFacet({ module, declaration: {
    name: "presenter", tag: "Presenter", mode: "structured", outputs: [
      types.header,
      types.sourceSpec,
      types.sources,
      types.program,
      compositionTypes.visualTrack,
    ],
    vocabulary: { summary: "Continuing presenter role owned by the explainer project.", attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Presenter identity." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Completed Timeline." },
      { name: "within", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Picture plane available to Presenter treatments that move beyond their local Frame." },
    ], children: [
      { tag: "Source", cardinality: "many", summary: "One native presenter media occurrence.", attributes: [
        { name: "id", kind: "identifier", required: true, summary: "Source identity." },
        { name: "media", kind: "reference", required: true, accepts: [mediaTypes.synchronized], summary: "Normalized media." },
        { name: "window", kind: "reference", required: true, accepts: [temporalTypes.window], summary: "Exact native Window." },
      ] },
      { tag: "Use", cardinality: "many", summary: "Selects presenter treatment over a Window; later Uses replace earlier ones.", attributes: [
        { name: "id", kind: "identifier", required: false, summary: "Use identity." },
        { name: "style", kind: "reference", required: true, accepts: [types.style], summary: "Presenter treatment." },
        ...temporalWindowAttributeVocabulary,
      ] },
    ], ports: [{ name: "visual", type: compositionTypes.visualTrack, summary: "Presenter visual contribution." }] },
  }, handler: ({ element, resolveReference }) => {
    assertAttributes(element, ["id", "timeline", "within"]);
    const id = textAttribute(element, "id");
    const context = resolveTemporalContext({ element, resolveReference });
    const within = ref(element, "within", spatialTypes.frame, resolveReference);
    const records = [{ id: `${id}.header`, type: types.header, value: stored({ id }), range: element.range }];
    const components = [], sourceDeclarations = [], uses = [];
    for (const child of element.children) {
      if (child.kind === "text") { if (child.value.trim()) throw Error("Presenter accepts only Source and Use children."); continue; }
      const tag = child.name.split(":").at(-1);
      if (tag === "Source") {
        assertAttributes(child, ["id", "media", "window"]); assertEmptyElement(child);
        const sourceId = textAttribute(child, "id"), specId = `${id}.source.${sourceDeclarations.length + 1}`;
        records.push({ id: specId, type: types.sourceSpec, value: stored({ id: sourceId }), range: child.range });
        sourceDeclarations.push({ specId, media: ref(child, "media", mediaTypes.synchronized, resolveReference), window: ref(child, "window", temporalTypes.window, resolveReference) });
      } else if (tag === "Use") uses.push(child);
      else throw Error("Presenter accepts only Source and Use children.");
    }
    if (!sourceDeclarations.length || !uses.length) throw Error("Presenter requires at least one Source and one Use.");
    const sourceInputs = [{ name: "timeline", type: timelineTypes.timeline }, ...sourceDeclarations.flatMap((_, index) => [
      { name: `spec-${index}`, type: types.sourceSpec }, { name: `media-${index}`, type: mediaTypes.synchronized }, { name: `window-${index}`, type: temporalTypes.window },
    ])];
    const sourceOps = sourceDeclarations.map((_, index) => ({ id: `source-${index}`, producer: producers.source, inputs: {
      spec: input(`spec-${index}`), media: input(`media-${index}`), window: input(`window-${index}`), timeline: input("timeline"),
    }, result: { kind: "output", name: "sources" } }));
    let sourceRoots = sourceDeclarations.map((_, index) => `source-${index}`);
    let combineIndex = 0;
    while (sourceRoots.length > 1) {
      const nextRoots = [];
      for (let index = 0; index < sourceRoots.length; index += 2) {
        const left = sourceRoots[index], right = sourceRoots[index + 1];
        if (right === undefined) { nextRoots.push(left); continue; }
        const combineId = `combine-source-${++combineIndex}`;
        sourceOps.push({ id: combineId, producer: producers.combineSources, inputs: { left: operation(left), right: operation(right) }, result: { kind: "output", name: "sources" } });
        nextRoots.push(combineId);
      }
      sourceRoots = nextRoots;
    }
    const [sourceRoot] = sourceRoots;
    const sourceFragment = sealGraphFragment({ inputs: sourceInputs, operations: sourceOps, exports: [{ name: "sources", type: types.sources, root: operation(sourceRoot) }] });
    components.push({ id: `${id}.__sources`, fragment: sourceFragment, inputs: { timeline: context.timeline.ref, ...Object.fromEntries(sourceDeclarations.flatMap((source, index) => [
      [`spec-${index}`, { kind: "record", id: source.specId }], [`media-${index}`, source.media.ref], [`window-${index}`, source.window.ref],
    ])) }, outputs: { sources: `${id}.__sources.value` }, range: element.range });
    const collectorInputs = [{ name: "timeline", type: timelineTypes.timeline }, { name: "header", type: types.header }];
    const bindings = { timeline: context.timeline.ref, header: { kind: "record", id: `${id}.header` } };
    const ops = [{ id: "empty", producer: producers.create, inputs: {}, result: { kind: "output", name: "program" } }];
    let previous = "empty";
    for (const [index, child] of uses.entries()) {
      assertAttributes(child, ["id", "style", ...temporalWindowAttributeNames]); assertEmptyElement(child);
      const useId = optionalTextAttribute(child, "id") ?? `${id}.use.${index + 1}`;
      const temporal = resolveTemporalWindowReference({ element: child, resolveReference });
      const style = authored(ref(child, "style", types.style, resolveReference), "Presenter Style");
      const needsWithin = style.fragment.inputs.some((port) => port.name === "within");
      components.push({ id: `${useId}.__style`, fragment: style.fragment, inputs: {
        ...Object.fromEntries(Object.entries(style.bindings).map(([name, value]) => [name, value.ref])),
        timeline: context.timeline.ref,
        ...(needsWithin ? { within: within.ref } : {}),
        sources: { kind: "component-output", component: `${id}.__sources`, output: "sources" }, window: temporal.ref,
      }, outputs: { visual: `${useId}.visual` }, range: child.range });
      collectorInputs.push({ name: `window-${index}`, type: temporalTypes.window }, { name: `visual-${index}`, type: compositionTypes.visualTrack });
      bindings[`window-${index}`] = temporal.ref;
      bindings[`visual-${index}`] = { kind: "component-output", component: `${useId}.__style`, output: "visual" };
      const appendId = `append-${index}`;
      ops.push({ id: appendId, producer: producers.append, inputs: { program: operation(previous), window: input(`window-${index}`), visual: input(`visual-${index}`) }, result: { kind: "output", name: "program" } });
      previous = appendId;
    }
    ops.push({ id: "resolve", producer: producers.resolve, inputs: { program: operation(previous), timeline: input("timeline"), header: input("header") }, result: { kind: "output", name: "visual" } });
    const collector = sealGraphFragment({ inputs: collectorInputs, operations: ops, exports: [{ name: "program", type: types.program, root: operation(previous) }, { name: "visual", type: compositionTypes.visualTrack, root: operation("resolve") }] });
    components.push({ id, fragment: collector, inputs: bindings, outputs: { program: `${id}.program`, visual: `${id}.visual` }, range: element.range });
    return { records, components, exports: [`${id}.program`, `${id}.visual`] };
  } });
  return { types, styleFacet, presenterFacet };
}
