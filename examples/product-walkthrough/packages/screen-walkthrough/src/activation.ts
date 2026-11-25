import { assertAttributes, assertEmptyElement, createMarkupSurfaceFacet, textAttribute } from "@hypit/hypit/markup";
import { canonicalize, sameType } from "@hypit/hypit/protocol";
import { sealGraphFragment } from "@hypit/hypit/author";
import { createAdmissionPackageFacet } from "@hypit/hypit/admission";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { recipeType } from "@hypit/hypit/recipe";
import type { Recipe } from "@hypit/hypit/recipe";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { AdmissionPackage } from "@hypit/hypit/admission";
import type { ModuleManifest, TypeRef } from "@hypit/hypit/protocol";
import type { StructuredSurfaceHandler, SurfaceResolvedReference } from "@hypit/hypit/markup";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import type { SynchronizedMedia } from "@hypit/media";
import { timelineTypes } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import { spatialTypes } from "@hypit/spatial";
import type { SpatialFrame } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import type { TemporalWindow } from "@hypit/temporal";
import { resolveTemporalContext, resolveTemporalWindowReference, temporalContextAttributeVocabulary,
  temporalWindowAttributeNames, temporalWindowAttributeVocabulary } from "@hypit/temporal/markup";
import { readWalkthroughTake, renderWalkthrough } from "./render.js";
import type { WalkthroughOptions } from "./render.js";

const module = { name: "@example/screen-walkthrough", version: "1" } as const;
const optionsType = { module, name: "WalkthroughOptions" };
const producer = { module, name: "compose" };
const inputs = [
  { name: "timeline", type: timelineTypes.timeline }, { name: "within", type: spatialTypes.frame },
  { name: "window", type: temporalTypes.window }, { name: "media", type: mediaTypes.synchronized },
  { name: "sourceWindow", type: temporalTypes.window }, { name: "take", type: recipeType },
  { name: "options", type: optionsType },
];
export const manifest: ModuleManifest = { format: "hypit.module@1", ...module,
  dependencies: [compositionTypes.visualTrack, mediaTypes.synchronized, timelineTypes.timeline,
    spatialTypes.frame, temporalTypes.window, recipeType].map((type) => ({ module: type.module })),
  types: [{ name: optionsType.name }], capabilities: [],
  producers: [{ name: producer.name, inputs, outputs: [{ name: "visual", type: compositionTypes.visualTrack }], needs: [] }],
};
const fragment = sealGraphFragment({ inputs, operations: [{ id: "compose", producer,
  inputs: Object.fromEntries(inputs.map((input) => [input.name, { kind: "fragment-input" as const, name: input.name }])),
  result: { kind: "output", name: "visual" } }],
  exports: [{ name: "visual", type: compositionTypes.visualTrack, root: { kind: "fragment-operation", operation: "compose" } }],
});
const inline = <T>(record: { value: { kind: string; value?: unknown } } | undefined): T => {
  if (record?.value.kind !== "inline") throw new Error("Walkthrough inputs must be inline values.");
  return record.value.value as T;
};
const component: ProducerPackage & AdmissionPackage = { producers: [{ producer, handler: ({ inputs }) => {
  const take = inline<Recipe>(inputs.take);
  return { needs: {}, outputs: { visual: { kind: "inline", value: canonicalize(renderWalkthrough(
    inline<Timeline>(inputs.timeline), inline<SpatialFrame>(inputs.within), inline<TemporalWindow>(inputs.window),
    inline<SynchronizedMedia>(inputs.media), inline<TemporalWindow>(inputs.sourceWindow),
    readWalkthroughTake(take.properties as Record<string, unknown>, take.path), inline<WalkthroughOptions>(inputs.options))) } } };
} }] };

function optionalNumber(raw: unknown, name: string, fallback: number): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (typeof raw !== "string" || !Number.isFinite(value)) throw new Error(`${name} must be a number.`);
  return value;
}

export const decodeSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "timeline", "within", "media", "source-window", "take", "zoom", "cursor", "layout", "stack-order",
    ...temporalWindowAttributeNames]);
  assertEmptyElement(element);
  const id = textAttribute(element, "id");
  const reference = (name: string, type: TypeRef): SurfaceResolvedReference => {
    const raw = element.attributes[name];
    if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${name} must be a reference.`);
    const value = resolveReference(raw.path);
    if (value === undefined || !sameType(type, value.type)) throw new Error(`${name} has the wrong type.`);
    return value;
  };
  const cursor = element.attributes.cursor ?? "arrow";
  if (cursor !== "arrow" && cursor !== "none") throw new Error("cursor must be arrow or none.");
  const layout = element.attributes.layout ?? "card";
  if (layout !== "card" && layout !== "full") throw new Error("layout must be card or full.");
  const options: WalkthroughOptions = { id, zoom: optionalNumber(element.attributes.zoom, "zoom", 1.6),
    cursor: cursor === "arrow", layout, stackingOrder: optionalNumber(element.attributes["stack-order"], "stack-order", 0) };
  if (!(options.zoom >= 1 && options.zoom <= 3)) throw new Error("zoom must be between 1 and 3.");
  const context = resolveTemporalContext({ element, resolveReference });
  const window = resolveTemporalWindowReference({ element, resolveReference });
  return { records: [{ id: `${id}.options`, type: optionsType, value: { kind: "inline", value: canonicalize(options) }, range: element.range }],
    fragments: [fragment],
    components: [{ id, fragment: fragment.id,
      inputs: { timeline: context.timeline.ref, within: reference("within", spatialTypes.frame).ref,
        media: reference("media", mediaTypes.synchronized).ref,
        sourceWindow: reference("source-window", temporalTypes.window).ref,
        take: reference("take", recipeType).ref, window: window.ref,
        options: { kind: "record", id: `${id}.options` } }, outputs: { visual: `${id}.visual` }, range: element.range }],
    exports: [`${id}.visual`] };
};

const declaration = { name: "walkthrough", tag: "Walkthrough", mode: "structured" as const,
  outputs: [compositionTypes.visualTrack, optionsType],
  vocabulary: { summary: "A recorded product walkthrough on a screen card, with cursor, click ripples and a camera that follows each action.",
    attributes: [
      { name: "id", kind: "literal" as const, required: true, summary: "Names the walkthrough; its picture is id.visual." },
      ...temporalContextAttributeVocabulary,
      { name: "within", kind: "reference" as const, required: true, accepts: [spatialTypes.frame], summary: "Frame the screen card fits inside." },
      { name: "media", kind: "reference" as const, required: true, accepts: [mediaTypes.synchronized], summary: "Normalized recording from hypit capture plan." },
      { name: "source-window", kind: "reference" as const, required: true, accepts: [temporalTypes.window], summary: "Window the full recording occupies; recorded step times follow it." },
      { name: "take", kind: "reference" as const, required: true, accepts: [recipeType], summary: "walkthrough.take Recipe from the take's steps.svs." },
      { name: "zoom", kind: "literal" as const, required: false, summary: "Camera magnification on pointer actions, 1–3 (default 1.6; 1 disables)." },
      { name: "cursor", kind: "literal" as const, required: false, summary: "arrow (default) draws the cursor and click ripples; none omits them." },
      { name: "layout", kind: "literal" as const, required: false, summary: "card (default): framed screen with margin; full: the screen fills the Frame." },
      { name: "stack-order", kind: "literal" as const, required: false, summary: "Paint order among other contributions (default 0)." },
      ...temporalWindowAttributeVocabulary,
    ], ports: [{ name: "visual", type: compositionTypes.visualTrack, summary: "The framed, followed walkthrough." }],
    example: '<walk:Walkthrough id="demo" timeline={program.timeline} within={canvas.bounds} media={take-media.media} source-window={program.take} during={program.take} take={take.walkthrough.take}/>',
  },
};
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest }],
  facets: [createProducerPackageFacet(component), createAdmissionPackageFacet(component),
    createMarkupSurfaceFacet({ module, declaration, handler: decodeSurface })] };
export default hypitPackage;
