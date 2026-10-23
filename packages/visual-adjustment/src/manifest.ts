import { compositionDependency, compositionTypes, visualAdjustmentSchema } from "@hypit/composition";
import type { StructuredSurfaceDeclaration, SurfaceVocabulary } from "@hypit/hypit/markup";
import { recipeModuleRef, recipeType } from "@hypit/hypit/recipe";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { temporalContextAttributeVocabulary, temporalWindowAttributeVocabulary } from "@hypit/temporal/markup";
import { timelineDependency, timelineTypes } from "@hypit/timeline";
import { visualAdjustmentProperties } from "./author.js";

export const visualAdjustmentModuleRef = { name: "@hypit/visual-adjustment", version: "1" } as const;
export const visualAdjustmentTypes = {
  header: { module: visualAdjustmentModuleRef, name: "VisualAdjustmentHeader" },
  spec: { module: visualAdjustmentModuleRef, name: "VisualAdjustmentSpec" },
  set: { module: visualAdjustmentModuleRef, name: "VisualAdjustmentSet" },
} satisfies Record<string, TypeRef>;
export const visualAdjustmentProducers = {
  createSet: { module: visualAdjustmentModuleRef, name: "create-adjustment-set" },
  append: { module: visualAdjustmentModuleRef, name: "append-adjustment" },
  finalize: { module: visualAdjustmentModuleRef, name: "finalize-adjustment-track" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema }>>): ValueSchema => ({ kind: "object", fields });
export const visualAdjustmentHeaderSchema = object({ id: { schema: string } });
export const visualAdjustmentSpecSchema = object({
  id: { schema: string },
  program: { schema: { kind: "object", fields: {}, allowUnknown: true } },
});
export const visualAdjustmentSetSchema = object({ items: { schema: { kind: "array", items: visualAdjustmentSchema } } });

export const visualAdjustmentMarkupSurfaces: readonly (StructuredSurfaceDeclaration & {
  readonly vocabulary: SurfaceVocabulary;
})[] = [{
  name: "track", tag: "Track", mode: "structured",
  outputs: [visualAdjustmentTypes.header, visualAdjustmentTypes.spec, compositionTypes.visualTrack],
  vocabulary: {
    summary: "Creates a VisualTrack whose items transform the already accumulated picture without owning a new picture source.",
    appearance: "Each Adjustment applies one ordered color, blur, opacity or affine transformation to lower visual contributions during its Window.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the terminal VisualTrack." },
      ...temporalContextAttributeVocabulary,
    ],
    children: [{ tag: "Adjustment", cardinality: "many", summary: "Applies one Recipe-owned transformation at a local position in the current VisualScope.", attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the authored adjustment subject." },
      { name: "appearance", kind: "reference", required: true, accepts: [recipeType], summary: "Selects orthogonal visual transformation parameters.",
        recipe: visualAdjustmentProperties.map(({ name, summary }) => ({ name, required: false, summary })) },
      ...temporalWindowAttributeVocabulary,
    ] }],
    ports: [{ name: "visual", type: compositionTypes.visualTrack, summary: "The Adjustment-only VisualTrack." }],
    example: [
      '<adjust:Track id="look" timeline={story.timeline}>',
      '  <adjust:Adjustment id="cinematic" during={story.body} appearance={recipes.look.cinematic}/>',
      "</adjust:Track>",
    ].join("\n"),
  },
}] as const;

export const visualAdjustmentManifest: ModuleManifest = {
  format: "hypit.module@1", name: visualAdjustmentModuleRef.name, version: visualAdjustmentModuleRef.version,
  dependencies: [compositionDependency, temporalDependency, timelineDependency, recipeModuleRef],
  types: [visualAdjustmentTypes.header.name, visualAdjustmentTypes.spec.name, visualAdjustmentTypes.set.name],
  capabilities: [],
  producers: [
    { name: visualAdjustmentProducers.createSet.name, inputs: [], result: { kind: "output", name: "set", type: visualAdjustmentTypes.set } },
    { name: visualAdjustmentProducers.append.name, inputs: [
      { name: "set", type: visualAdjustmentTypes.set }, { name: "header", type: visualAdjustmentTypes.header },
      { name: "timeline", type: timelineTypes.timeline }, { name: "spec", type: visualAdjustmentTypes.spec },
      { name: "window", type: temporalTypes.window },
    ], result: { kind: "output", name: "set", type: visualAdjustmentTypes.set } },
    { name: visualAdjustmentProducers.finalize.name, inputs: [
      { name: "set", type: visualAdjustmentTypes.set }, { name: "header", type: visualAdjustmentTypes.header },
      { name: "timeline", type: timelineTypes.timeline },
    ], result: { kind: "output", name: "track", type: compositionTypes.visualTrack } },
  ],
};
