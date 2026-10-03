import { artifactTypes } from "@hypit/hypit/artifact";
import { compositionTypes } from "@hypit/hypit/composition";
import { assertAttributes, assertEmptyElement, canonicalize, createMarkupSurfaceHostFacet, sameType, sealGraphFragment, textAttribute } from "@hypit/hypit/author-kit";
import { createStudioTrackCompanionHostFacet } from "@hypit/hypit/studio-adapter";
import type { BlobRef, ComponentPackage, ModuleManifest, StructuredSurfaceHandler, SurfaceResolvedReference, TypeRef } from "@hypit/hypit/author-kit";
import { spatialTypes } from "@hypit/hypit/spatial";
import type { CanvasSpace } from "@hypit/hypit/spatial";
import { narrativeTypes } from "@hypit/hypit/narrative";
import { temporalTypes } from "@hypit/hypit/temporal";
import type { TemporalInstant, TemporalWindow } from "@hypit/hypit/temporal";
import { timelineTypes } from "@hypit/hypit/timeline";
import type { Timeline } from "@hypit/hypit/timeline";
import { createTemporalInstantProjection, createTemporalWindowProjection, resolveTemporalContext,
  temporalContextAttributeVocabulary, temporalWindowAttributeNames, temporalWindowAttributeVocabulary } from "@hypit/hypit/temporal-markup";
import { renderManimShowcase } from "./render.js";
import { manimShowcaseStudioTrackCompanions } from "./studio.js";

const module = { name: "@project/manim-showcase", version: "1" } as const;
const producer = { module, name: "render" } as const;
const eventNames = ["first", "next", "finally", "these"] as const;
const producerInputs = [
  { name: "timeline", type: timelineTypes.track }, { name: "canvas", type: spatialTypes.canvas },
  { name: "window", type: temporalTypes.window },
  ...eventNames.map(name => ({ name, type: temporalTypes.instant })),
  { name: "host", type: artifactTypes.blob }, { name: "math", type: artifactTypes.blob },
  { name: "ml", type: artifactTypes.blob }, { name: "physics", type: artifactTypes.blob },
];
const value = (data: unknown) => ({ kind: "inline" as const, value: canonicalize(data) });
const input = (name: string) => ({ kind: "fragment-input" as const, name });
const inline = <T>(record: { value: { kind: string; value?: unknown } } | undefined): T => {
  if (record?.value.kind !== "inline") throw new Error("Manim showcase expected an inline value.");
  return record.value.value as T;
};
const blob = (record: { value: { kind: string } } | undefined): BlobRef => {
  if (record?.value.kind !== "blob") throw new Error("Manim showcase expected a Blob artifact.");
  return record.value as BlobRef;
};

export const manifest: ModuleManifest = { format: "hypit.module@1", ...module,
  dependencies: [artifactTypes.blob, compositionTypes.visualTrack, timelineTypes.track, spatialTypes.canvas,
    temporalTypes.window, narrativeTypes.moment].map(type => ({ module: type.module })),
  types: [], capabilities: [], producers: [{ name: producer.name, inputs: producerInputs,
    outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] }],
};

const component: ComponentPackage = { producers: [{ producer, handler: ({ inputs }) => ({
  outputs: { track: value(renderManimShowcase(inline<Timeline>(inputs.timeline), inline<CanvasSpace>(inputs.canvas), inline<TemporalWindow>(inputs.window), {
    first: inline<TemporalInstant>(inputs.first), next: inline<TemporalInstant>(inputs.next),
    finally: inline<TemporalInstant>(inputs.finally), these: inline<TemporalInstant>(inputs.these),
    host: blob(inputs.host), math: blob(inputs.math), ml: blob(inputs.ml), physics: blob(inputs.physics),
  })) }, needs: {},
}) }] };

export const decodeSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "timeline", "canvas", "host", "math", "ml", "physics", ...eventNames, ...temporalWindowAttributeNames]);
  assertEmptyElement(element);
  const id = textAttribute(element, "id");
  const context = resolveTemporalContext({ element, resolveReference });
  const window = createTemporalWindowProjection({ id: `${id}.window`, subjectId: id, element, ...context, resolveReference });
  const reference = (name: string, type: TypeRef): SurfaceResolvedReference => {
    const raw = element.attributes[name];
    if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${name} must be a reference.`);
    const found = resolveReference(raw.path);
    if (found === undefined || !sameType(found.type, type)) throw new Error(`${name} has the wrong Type.`);
    return found;
  };
  const host = reference("host", artifactTypes.blob), math = reference("math", artifactTypes.blob), ml = reference("ml", artifactTypes.blob), physics = reference("physics", artifactTypes.blob);
  eventNames.forEach(name => reference(name, narrativeTypes.moment));
  const events = Object.fromEntries(eventNames.map(name => {
    const attribute = element.attributes[name];
    if (attribute === undefined) throw new Error(`${name} is required.`);
    const projected = createTemporalInstantProjection({
      id: `${id}.${name}`, subjectId: `${id}.${name}`,
      element: { ...element, attributes: { [name]: attribute } },
      semanticAttribute: name, projectedAttribute: false,
      timeline: context.timeline, resolveReference,
    });
    return [name, projected];
  })) as Record<typeof eventNames[number], ReturnType<typeof createTemporalInstantProjection>>;
  const records = [...window.records];
  const components = [...window.components];
  const fragments = [...window.fragments];
  eventNames.forEach(name => {
    records.push(...events[name].records);
    components.push(...events[name].components);
    fragments.push(...events[name].fragments);
  });
  const inputs = producerInputs.map(({ name, type }) => ({ name, type }));
  const bindings: Record<string, SurfaceResolvedReference["ref"]> = {
    timeline: context.timeline.ref, canvas: reference("canvas", spatialTypes.canvas).ref,
    window: window.ref, host: host.ref, math: math.ref, ml: ml.ref, physics: physics.ref,
  };
  eventNames.forEach(name => { bindings[name] = events[name].ref; });
  const fragment = sealGraphFragment({ inputs, operations: [{ id: "render", producer,
    inputs: Object.fromEntries(producerInputs.map(({ name }) => [name, input(name)])),
    result: { kind: "output", name: "track" } }],
    exports: [{ name: "track", type: compositionTypes.visualTrack, root: { kind: "fragment-operation", operation: "render" } }] });
  return { records, fragments: [...fragments, fragment], components: [...components,
    { id, fragment: fragment.id, inputs: bindings, outputs: { track: `${id}.track` }, range: element.range }], exports: [`${id}.track`] };
};

const declaration = { name: "scene", tag: "Scene", mode: "structured" as const,
  outputs: [compositionTypes.visualTrack, timelineTypes.track, temporalTypes.window, temporalTypes.instant, temporalTypes.windowSpec, temporalTypes.instantSpec],
  vocabulary: { summary: "A portrait HTML/HyperFrames composition with a presenter and three Manim video cards.", attributes: [
    ...temporalContextAttributeVocabulary, ...temporalWindowAttributeVocabulary,
    ...["id", "timeline", "canvas", "host", "math", "ml", "physics"].map(name => ({ name, kind: "expression" as const, required: true, summary: name })),
    ...eventNames.map(name => ({ name, kind: "expression" as const, required: true, accepts: [narrativeTypes.moment], summary: `Semantic ${name} trigger from Script.` })),
  ], children: [], ports: [{ name: "track", type: compositionTypes.visualTrack, summary: "The complete Manim showcase." }],
  example: '<manim:Scene id="showcase" timeline={program.timeline} canvas={canvas} host={host-source} math={math-source} ml={ml-source} physics={physics-source} first={story.moment.first} next={story.moment.next} finally={story.moment.finally} these={story.moment.these} during="program"/>' } };

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest }],
  components: [component],
  hostFacets: [
    createMarkupSurfaceHostFacet({ module, declaration, handler: decodeSurface }),
    createStudioTrackCompanionHostFacet(manimShowcaseStudioTrackCompanions),
  ],
};
export default hypitPackage;
