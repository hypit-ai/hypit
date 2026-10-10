import { compositionTypes } from "@hypit/hypit/composition";
import { assertAttributes, assertEmptyElement, createMarkupSurfaceFacet, textAttribute } from "@hypit/hypit/markup";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { sealGraphFragment } from "@hypit/hypit/author";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAdmissionPackageFacet } from "@hypit/hypit/admission";
import { createStudioTrackCompanionFacet } from "@hypit/studio-companion";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { ModuleManifest, TypeRef } from "@hypit/hypit/protocol";
import type { StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/hypit/markup";
import { mediaTypes } from "@hypit/hypit/media";
import type { SynchronizedMedia } from "@hypit/hypit/media";
import { spatialTypes } from "@hypit/hypit/spatial";
import type { Canvas } from "@hypit/hypit/spatial";
import { temporalTypes } from "@hypit/hypit/temporal";
import type { TemporalInstant, TemporalWindow } from "@hypit/hypit/temporal";
import { timelineTypes } from "@hypit/hypit/timeline";
import type { Timeline } from "@hypit/hypit/timeline";
import { resolveTemporalContext, resolveTemporalWindowReference, resolveTemporalInstantReference,
  temporalContextAttributeVocabulary, temporalWindowAttributeNames, temporalWindowAttributeVocabulary } from "@hypit/hypit/temporal/markup";
import { renderManimShowcase } from "./render.js";
import { manimShowcaseStudioTrackCompanions } from "./studio.js";

const module = { name: "@project/manim-showcase", version: "1" } as const;
const producer = { module, name: "render" } as const;
const eventNames = ["first", "next", "finally", "these"] as const;
const producerInputs = [
  { name: "timeline", type: timelineTypes.timeline }, { name: "canvas", type: spatialTypes.canvas },
  { name: "window", type: temporalTypes.window },
  ...eventNames.map(name => ({ name, type: temporalTypes.instant })),
  { name: "math", type: mediaTypes.synchronized },
  { name: "ml", type: mediaTypes.synchronized }, { name: "physics", type: mediaTypes.synchronized },
];
const value = (data: unknown) => ({ kind: "inline" as const, value: canonicalize(data) });
const input = (name: string) => ({ kind: "fragment-input" as const, name });
const inline = <T>(record: { value: { kind: string; value?: unknown } } | undefined): T => {
  if (record?.value.kind !== "inline") throw new Error("Manim showcase expected an inline value.");
  return record.value.value as T;
};
const synchronized = (record: { value: { kind: string; value?: unknown } } | undefined): SynchronizedMedia => {
  if (record?.value.kind !== "inline") throw new Error("Manim showcase expected normalized media.");
  return record.value.value as SynchronizedMedia;
};

export const manifest: ModuleManifest = { format: "hypit.module@1", ...module,
  dependencies: [...new Map([mediaTypes.synchronized, compositionTypes.visualTrack, timelineTypes.timeline, spatialTypes.canvas,
    temporalTypes.window, temporalTypes.instant].map(type => [type.module.name, { module: type.module }])).values()],
  types: [], capabilities: [], producers: [{ name: producer.name, inputs: producerInputs,
    outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] }],
};

const component: ProducerPackage = { producers: [{ producer, handler: ({ inputs }) => ({
  outputs: { track: value(renderManimShowcase(inline<Timeline>(inputs.timeline), inline<Canvas>(inputs.canvas), inline<TemporalWindow>(inputs.window), {
    first: inline<TemporalInstant>(inputs.first), next: inline<TemporalInstant>(inputs.next),
    finally: inline<TemporalInstant>(inputs.finally), these: inline<TemporalInstant>(inputs.these),
    math: synchronized(inputs.math), ml: synchronized(inputs.ml), physics: synchronized(inputs.physics),
  })) }, needs: {},
}) }] };

export const decodeSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "timeline", "canvas", "math", "ml", "physics", ...eventNames, ...temporalWindowAttributeNames]);
  assertEmptyElement(element);
  const id = textAttribute(element, "id");
  const context = resolveTemporalContext({ element, resolveReference });
  const window = resolveTemporalWindowReference({ element, resolveReference });
  const reference = (name: string, type: TypeRef): SurfaceResolvedReference => {
    const raw = element.attributes[name];
    if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${name} must be a reference.`);
    const found = resolveReference(raw.path);
    if (found === undefined || !sameType(found.type, type)) throw new Error(`${name} has the wrong Type.`);
    return found;
  };
  const math = reference("math", mediaTypes.synchronized), ml = reference("ml", mediaTypes.synchronized), physics = reference("physics", mediaTypes.synchronized);
  const events = Object.fromEntries(eventNames.map(name => [name,
    resolveTemporalInstantReference({ element, resolveReference, attribute: name }),
  ])) as Record<typeof eventNames[number], SurfaceResolvedReference>;
  const inputs = producerInputs.map(({ name, type }) => ({ name, type }));
  const bindings: Record<string, SurfaceResolvedReference["ref"]> = {
    timeline: context.timeline.ref, canvas: reference("canvas", spatialTypes.canvas).ref,
    window: window.ref, math: math.ref, ml: ml.ref, physics: physics.ref,
  };
  eventNames.forEach(name => { bindings[name] = events[name].ref; });
  const fragment = sealGraphFragment({ inputs, operations: [{ id: "render", producer,
    inputs: Object.fromEntries(producerInputs.map(({ name }) => [name, input(name)])),
    result: { kind: "output", name: "track" } }],
    exports: [{ name: "track", type: compositionTypes.visualTrack, root: { kind: "fragment-operation", operation: "render" } }] });
  return { records: [], fragments: [fragment], components: [
    { id, fragment: fragment.id, inputs: bindings, outputs: { track: `${id}.track` }, range: element.range }], exports: [`${id}.track`] };
};

const declaration = { name: "scene", tag: "Scene", mode: "structured" as const,
  outputs: [compositionTypes.visualTrack],
  vocabulary: { summary: "A portrait HTML overlay with three Manim video cards over the Timeline presenter.", attributes: [
    ...temporalContextAttributeVocabulary, ...temporalWindowAttributeVocabulary,
    ...["id", "canvas", "math", "ml", "physics"].map(name => ({ name, kind: "expression" as const, required: true, summary: name })),
    ...eventNames.map(name => ({ name, kind: "expression" as const, required: true, accepts: [temporalTypes.instant], summary: `Resolved ${name} trigger projected upstream from Script.` })),
  ], children: [], ports: [{ name: "track", type: compositionTypes.visualTrack, summary: "The complete Manim showcase." }],
  example: '<manim:Scene id="showcase" timeline={speech.timeline} canvas={assets.canvas.canvas} math={math-media.media} ml={ml-media.media} physics={physics-media.media} first={first-cue} next={next-cue} finally={finally-cue} these={these-cue} during={speech.window}/>' } };

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest }],
  facets: [
    createProducerPackageFacet(component),
    createAdmissionPackageFacet(component),
    createMarkupSurfaceFacet({ module, declaration, handler: decodeSurface }),
    createStudioTrackCompanionFacet(manimShowcaseStudioTrackCompanions),
  ],
};
export default hypitPackage;
