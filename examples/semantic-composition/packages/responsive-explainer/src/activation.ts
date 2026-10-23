import { assertAttributes, assertEmptyElement, createMarkupSurfaceFacet, textAttribute } from "@hypit/hypit/markup";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { sealGraphFragment } from "@hypit/hypit/author";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ModuleManifest, TypeRef, TypedRecord } from "@hypit/hypit/protocol";
import type { StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/hypit/markup";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import type { FontStackRef } from "@hypit/media";
import type { SynchronizedMedia } from "@hypit/media";
import { timelineTypes } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import { spatialTypes } from "@hypit/spatial";
import type { SpatialFrame } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import type { TemporalInstant, TemporalWindow } from "@hypit/temporal";
import { resolveTemporalInstantReference, resolveTemporalWindowReference, temporalWindowAttributeNames,
  temporalWindowAttributeVocabulary, resolveTemporalContext } from "@hypit/temporal/markup";
import { temporalContextAttributeVocabulary } from "@hypit/temporal/markup";
import { renderExplainer } from "./render.js";
import type { ExplainerOptions } from "./render.js";

const module = { name: "@example/responsive-explainer", version: "1" } as const;
const optionsType = { module, name: "ExplainerOptions" };
const producer = { module, name: "compose" };
const inputs = [
  { name: "timeline", type: timelineTypes.timeline }, { name: "within", type: spatialTypes.frame },
  { name: "window", type: temporalTypes.window }, { name: "reveal", type: temporalTypes.instant },
  { name: "media", type: mediaTypes.synchronized }, { name: "sourceWindow", type: temporalTypes.window },
  { name: "font", type: mediaTypes.fontStack }, { name: "options", type: optionsType },
];
export const manifest: ModuleManifest = { format: "hypit.module@1", ...module,
  dependencies: [compositionTypes.visualTrack, mediaTypes.fontStack, timelineTypes.timeline,
    spatialTypes.frame, temporalTypes.window, temporalTypes.instant]
    .map(type => type.module),
  types: [optionsType.name], capabilities: [],
  producers: [{ name: producer.name, inputs, result: { kind: "output" as const, name: "visual", type: compositionTypes.visualTrack } }],
};
const fragment = sealGraphFragment({ inputs, operations: [{ id: "compose", producer,
  inputs: Object.fromEntries(inputs.map(input => [input.name, { kind: "fragment-input" as const, name: input.name }])),
  result: { kind: "output" as const, name: "visual" } }],
  exports: [{ name: "visual", type: compositionTypes.visualTrack, root: { kind: "fragment-operation", operation: "compose" } }],
});
const valueOf = <T>(record: TypedRecord | undefined): T => {
  if (record?.value === undefined) throw new Error("Explainer inputs are missing.");
  return record.value as T;
};
const component: { producers?: ProducerPackage; refinements?: RefinementPackage } = { producers: [{ producer, handler: ({ inputs }) => ({ kind: "output", value: (canonicalize(renderExplainer(valueOf<Timeline>(inputs.timeline),
    valueOf<SpatialFrame>(inputs.within), valueOf<TemporalWindow>(inputs.window), valueOf<TemporalInstant>(inputs.reveal),
    valueOf<SynchronizedMedia>(inputs.media), valueOf<TemporalWindow>(inputs.sourceWindow),
    valueOf<FontStackRef>(inputs.font).faces, valueOf<ExplainerOptions>(inputs.options)))) }) }] };
export const decodeSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "timeline", "within", "font", "media", "source-window", "reveal", "title", "transition-frames", ...temporalWindowAttributeNames]);
  assertEmptyElement(element);
  const id = textAttribute(element, "id");
  const reference = (name: string, type: TypeRef): SurfaceResolvedReference => {
    const raw = element.attributes[name];
    if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${name} must be a reference.`);
    const value = resolveReference(raw.path);
    if (value === undefined || !sameType(type, value.type)) throw new Error(`${name} has the wrong type.`);
    return value;
  };
  const context = resolveTemporalContext({ element, resolveReference });
  const timeline = context.timeline;
  const window = resolveTemporalWindowReference({ element, resolveReference });
  // Reveal is already absolute; the outer Window independently controls this scene's lifetime.
  const reveal = resolveTemporalInstantReference({ element, resolveReference, attribute: "reveal" });
  const options: ExplainerOptions = { id, title: textAttribute(element, "title"),
    transitionFrames: Number(textAttribute(element, "transition-frames")) };
  return { records: [{ id: `${id}.options`, type: optionsType,
      value: (canonicalize(options)), range: element.range }],
    components: [{ id, fragment,
      inputs: { timeline: timeline.ref, within: reference("within", spatialTypes.frame).ref,
        font: reference("font", mediaTypes.fontStack).ref,
        media: reference("media", mediaTypes.synchronized).ref,
        sourceWindow: reference("source-window", temporalTypes.window).ref,
        window: window.ref, reveal: reveal.ref,
        options: { kind: "record", id: `${id}.options` } }, outputs: { visual: `${id}.visual` }, range: element.range }],
    exports: [`${id}.visual`] };
};
const declaration = { name: "scene", tag: "Scene", mode: "structured" as const,
  outputs: [compositionTypes.visualTrack, optionsType],
  vocabulary: { summary: "A continuously playing performance makes room for a diagram on a semantic Moment.",
    attributes: [
      ...["id", "title", "transition-frames"].map(name => ({ name, kind: "literal" as const, required: true, summary: name })),
      ...temporalContextAttributeVocabulary,
      ...[{ name: "within", type: spatialTypes.frame },
        { name: "font", type: mediaTypes.fontStack }, { name: "media", type: mediaTypes.synchronized },
        { name: "source-window", type: temporalTypes.window }, { name: "reveal", type: temporalTypes.instant }]
        .map(({ name, type }) => ({ name, kind: "reference" as const, required: true, accepts: [type], summary: name })),
      ...temporalWindowAttributeVocabulary,
    ], ports: [{ name: "visual", type: compositionTypes.visualTrack, summary: "The coordinated scene." }],
    example: '<explainer:Scene id="scene" timeline={speech.timeline} within={within} font={font} media={presenter.media} source-window={speech.presenter} during={speech.window} reveal={reveal} title="How it works" transition-frames="18"/>',
  },
};
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest }],
  facets: [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? []),
    createMarkupSurfaceFacet({ module, declaration, handler: decodeSurface })] };
export default hypitPackage;
