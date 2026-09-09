import { temporalContextAttributeVocabulary } from "@hypit/temporal-markup";
import { audioTrackSchema, compositionDependency, compositionTypes, visualTrackSchema } from "@hypit/composition";
import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { semanticTrackDependency } from "@hypit/semantic-track";
import { spatialDependency, spatialTypes } from "@hypit/spatial";
import { svsManifest, svsModuleRef, svsRecipeType } from "@hypit/svs";

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
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({
  kind: "object",
  fields,
});

export const filmProgramSchema: ValueSchema = object({

  id: { schema: string },
  clearColor: { schema: string },
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
        "Assembles any number of peer VisualTrack and AudioTrack references into one Composition against a Canvas and a SemanticTrack.",
      appearance:
        "One flat fill of the entire Canvas, in the single hexadecimal color the Recipe's `background` carries, lying behind everything else in the Frame. It covers the full Canvas width and height, holds that one color from the first Frame to the last, and never moves, fades or changes. Wherever nothing is painted over it, that color is what the Frame shows; the Film puts no mark of its own on top of it.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names the Film component and the Composition binding it publishes." },
        { name: "canvas", kind: "reference", required: true,
          accepts: [spatialTypes.canvas],
          summary: "Selects the CanvasSpace that decides the Composition's dimensions." },
        ...temporalContextAttributeVocabulary,
        { name: "appearance", kind: "reference", required: true,
          accepts: [svsRecipeType],
          summary: "Selects the SVS Recipe that decides the clear color behind every Track.",
          recipe: [
            { name: "background", required: true,
              summary: "Decides the color the Film clears to behind every Track, written as `#rrggbb` or `#rrggbbaa`." },
          ] },
      ],
      children: [
        { tag: "Track", cardinality: "many",
          summary: "Adds one VisualTrack or AudioTrack to the assembly.",
          attributes: [
            { name: "source", kind: "reference", required: true,
              accepts: [compositionTypes.visualTrack, compositionTypes.audioTrack],
              summary: "Selects the Track this entry contributes to the Composition." },
          ] },
      ],
      ports: [
        { name: "composition", type: compositionTypes.composition,
          summary: "The assembled Composition, addressed as `<id>.composition`." },
      ],
      example: [
        '<film:Film id="main" canvas={vertical} semantic={speech.semantic} appearance={recipes.film.vertical}>',
        "  <film:Track source={performance.visual}/>",
        "  <film:Track source={speech.audio}/>",
        "  <film:Track source={captions.track}/>",
        "</film:Film>",
      ].join("\n"),
      notes: [
        "At least one `Track` is required.",
        "The Recipe carries exactly one property, `background`, written as a hexadecimal color; any other property is rejected, and Canvas geometry and frame rate stay on their own edges.",
        "Child order is organizational: Track identity, timing and absolute stacking stay in their own typed values.",
      ],
    },
  }] as const;


export const filmManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: filmModuleRef.name,
  version: filmModuleRef.version,
  dependencies: [
    programSpaceDependency,
    semanticTrackDependency,
    spatialDependency,
    compositionDependency,
    { module: svsModuleRef },
  ],
  types: [
    { name: filmTypes.program.name },
    { name: filmTypes.trackSet.name },
  ],
  capabilities: [],
  producers: [
    {
      name: filmProducers.createTrackSet.name,
      inputs: [],
      outputs: [{ name: "set", type: filmTypes.trackSet }],
      needs: [],
    },
    {
      name: filmProducers.appendVisualTrack.name,
      inputs: [
        { name: "set", type: filmTypes.trackSet },
        { name: "space", type: programSpaceTypes.programSpace },
        { name: "track", type: compositionTypes.visualTrack },
      ],
      outputs: [{ name: "set", type: filmTypes.trackSet }],
      needs: [],
    },
    {
      name: filmProducers.appendAudioTrack.name,
      inputs: [
        { name: "set", type: filmTypes.trackSet },
        { name: "space", type: programSpaceTypes.programSpace },
        { name: "track", type: compositionTypes.audioTrack },
      ],
      outputs: [{ name: "set", type: filmTypes.trackSet }],
      needs: [],
    },
    {
      name: filmProducers.compileComposition.name,
      inputs: [
        { name: "program", type: filmTypes.program },
        { name: "canvas", type: spatialTypes.canvas },
        { name: "space", type: programSpaceTypes.programSpace },
        { name: "set", type: filmTypes.trackSet },
      ],
      outputs: [{ name: "composition", type: compositionTypes.composition }],
      needs: [],
    },
  ],
};
