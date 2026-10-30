import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { audioTrackSchema, compositionDependency, compositionTypes, visualTrackSchema } from "@hypit/composition";
import { spatialDependency, spatialTypes } from "@hypit/spatial";
import { recipeModuleRef, recipeType } from "@hypit/hypit/recipe";
import { timelineTypes, timelineDependency } from "@hypit/timeline";

export const filmModuleRef = { name: "@hypit/film", version: "1" } as const;
export const filmTypes = {
  program: { module: filmModuleRef, name: "FilmProgram" },
  trackSet: { module: filmModuleRef, name: "FilmTrackSet" },
} satisfies Record<string, TypeRef>;
export const filmProducers = {
  createTrackSet: { module: filmModuleRef, name: "create-track-set" },
  appendVisualTrack: { module: filmModuleRef, name: "append-visual-track" },
  appendAudioTrack: { module: filmModuleRef, name: "append-audio-track" },
  compileComposition: { module: filmModuleRef, name: "compile-composition" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>, allowUnknown = false): ValueSchema => ({
  kind: "object",
  fields,
  ...(allowUnknown ? { allowUnknown: true } : {}),
});

export const filmProgramSchema: ValueSchema = object({
  id: { schema: string },
  clearColor: { schema: string },
  // Film owns the recursive Plan refinement; admission keeps the envelope domain-neutral.
  visual: { schema: object({ members: { schema: { kind: "array", items: object({}, true) } } }) },
  audio: { schema: { kind: "array", items: { kind: "number", integer: true, minimum: 0 } } },
});

export const filmTrackSetSchema: ValueSchema = object({

  tracks: {
    schema: {
      kind: "array",
      items: { kind: "oneOf", variants: [visualTrackSchema, audioTrackSchema] },
    },
  },
});


export const filmManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: filmModuleRef.name,
  version: filmModuleRef.version,
  dependencies: [
    timelineDependency,
    spatialDependency,
    compositionDependency,
    recipeModuleRef,
  ],
  types: [
    filmTypes.program.name,
    filmTypes.trackSet.name,
  ],
  capabilities: [],
  producers: [
    {
      name: filmProducers.createTrackSet.name,
      inputs: [],
      result: { kind: "output" as const, name: "set", type: filmTypes.trackSet },
    },
    {
      name: filmProducers.appendVisualTrack.name,
      inputs: [
        { name: "set", type: filmTypes.trackSet },
        { name: "timeline", type: timelineTypes.timeline },
        { name: "track", type: compositionTypes.visualTrack },
      ],
      result: { kind: "output" as const, name: "set", type: filmTypes.trackSet },
    },
    {
      name: filmProducers.appendAudioTrack.name,
      inputs: [
        { name: "set", type: filmTypes.trackSet },
        { name: "timeline", type: timelineTypes.timeline },
        { name: "track", type: compositionTypes.audioTrack },
      ],
      result: { kind: "output" as const, name: "set", type: filmTypes.trackSet },
    },
    {
      name: filmProducers.compileComposition.name,
      inputs: [
        { name: "program", type: filmTypes.program },
        { name: "canvas", type: spatialTypes.canvas },
        { name: "timeline", type: timelineTypes.timeline },
        { name: "set", type: filmTypes.trackSet },
      ],
      result: { kind: "output" as const, name: "composition", type: compositionTypes.composition },
    },
  ],
};
