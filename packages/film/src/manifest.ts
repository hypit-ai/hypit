import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { audioTrackSchema, compositionDependency, compositionTypes, visualTrackSchema } from "@hypit/composition";
import { spatialDependency, spatialTypes } from "@hypit/spatial";
import { recipeManifest, recipeModuleRef, recipeType } from "@hypit/hypit/recipe";
import { temporalContextAttributeVocabulary } from "@hypit/temporal/markup";
import { timelineTypes, timelineDependency } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";

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

export const filmMarkupSurfaces = [{
    name: "film",
    tag: "Film",
    mode: "structured",
    outputs: [filmTypes.program],
    vocabulary: {
      summary:
        "Assembles VisualTrack references into recursive visual scopes and sums root AudioTrack references into one Composition against a Canvas and a Timeline.",
      appearance:
        "One flat fill of the entire Canvas, in the single hexadecimal color the Recipe's `background` carries, lying behind everything else in the Frame. It covers the full Canvas width and height, holds that one color from the first Frame to the last, and never moves, fades or changes. Wherever nothing is painted over it, that color is what the Frame shows; the Film puts no mark of its own on top of it.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names the Film component and the Composition binding it publishes." },
        { name: "canvas", kind: "reference", required: true,
          accepts: [spatialTypes.canvas],
          summary: "Selects the Canvas that decides the Composition's dimensions." },
        ...temporalContextAttributeVocabulary,
        { name: "appearance", kind: "reference", required: true,
          accepts: [recipeType],
          summary: "Selects the SVS Recipe that decides the clear color behind every Track.",
          recipe: [
            { name: "background", required: true,
              summary: "Decides the color the Film clears to behind every Track, written as `#rrggbb` or `#rrggbbaa`." },
          ] },
      ],
      children: [
        { tag: "Track", cardinality: "many",
          summary: "Adds one VisualTrack or root AudioTrack to the current Film assembly.",
          attributes: [
            { name: "id", kind: "identifier", required: false,
              summary: "Names a VisualTrack occurrence inside its parent scope; AudioTrack entries do not accept id." },
            { name: "source", kind: "reference", required: true,
              accepts: [compositionTypes.visualTrack, compositionTypes.audioTrack],
              summary: "Selects the Track this entry contributes to the Composition." },
          ] },
        { tag: "Stack", cardinality: "many",
          summary: "Groups VisualTrack and nested Stack children into one composited picture at this declaration position.",
          attributes: [
            { name: "id", kind: "identifier", required: true,
              summary: "Names this recursive visual scope." },
          ] },
      ],
      ports: [
        { name: "composition", type: compositionTypes.composition,
          summary: "The assembled Composition, addressed as `<id>.composition`." },
      ],
      example: [
        '<film:Film id="main" canvas={vertical.canvas} timeline={speech.timeline} appearance={recipes.film.vertical}>',
        '  <film:Track id="performance" source={performance.visual}/>',
        "  <film:Track source={voice.audio}/>",
        '  <film:Stack id="titles">',
        '    <film:Track id="captions" source={captions.visual}/>',
        "  </film:Stack>",
        "</film:Film>",
      ].join("\n"),
      notes: [
        "An empty Film is a valid clear-and-silent Composition; a declared Stack must contain a visual child.",
        "The Recipe carries exactly one property, `background`, written as a hexadecimal color; any other property is rejected, and Canvas geometry and frame rate stay on their own edges.",
        "Visual Track and Stack declarations are composed from bottom to top in written order; their sibling-unique ids identify occurrences and never decide paint order. AudioTrack has no visual occurrence id.",
        "A VisualTrack value may be placed more than once. Each placement has its own member id and occurrence path.",
        "AudioTrack is accepted only as a direct Film child. Root signals add as a multiset rather than being keyed by Track id; audio routing closes inside the package that produces an AudioTrack.",
      ],
    },
  }] as const;


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
