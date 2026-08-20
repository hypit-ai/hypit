import { readFile } from "node:fs/promises";

import { semanticTakeSchema, speechDependency, speechTypes } from "@hypit/speech";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { semanticTrackDependency, semanticTrackTypes } from "@hypit/semantic-track";
import {
  contentFitSchema,
  spatialDependency,
  spatialFrameSchema,
  spatialTypes,
} from "@hypit/spatial";
import { svsModuleRef, svsRecipeType } from "@hypit/svs";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

export const speechTrackModuleRef = { name: "@hypit/speech-track", version: "1" } as const;
export const speechTrackTypes = {
  header: { module: speechTrackModuleRef, name: "SpeechTrackHeader" },
  trackSet: { module: speechTrackModuleRef, name: "SpeechTrackSet" },
  visualSpec: { module: speechTrackModuleRef, name: "SpeechTrackVisualSpec" },
} satisfies Record<string, TypeRef>;
export const speechTrackProducers = {
  createSet: { module: speechTrackModuleRef, name: "create-track-set" },
  appendTake: { module: speechTrackModuleRef, name: "append-track-take" },
  assembleTrack: { module: speechTrackModuleRef, name: "assemble-semantic-track" },
  projectVisual: { module: speechTrackModuleRef, name: "project-semantic-visual-track" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({
  kind: "object",
  fields,
});

export const speechTrackHeaderSchema: ValueSchema = object({
  id: { schema: string },
});

export const speechTrackSetSchema: ValueSchema = object({
  takes: { schema: { kind: "array", items: object({
    semantic: { schema: semanticTakeSchema },
    visual: { schema: object({
      frame: { schema: spatialFrameSchema },
      fit: { schema: contentFitSchema },
      stackingOrder: { schema: { kind: "number", integer: true } },
    }), optional: true },
  }) } },
});

export const speechTrackVisualSpecSchema: ValueSchema = object({
  stackingOrder: { schema: { kind: "number", integer: true } },
});

const visualRecipeProperties = [
  { name: "fit", required: false, fallback: "contain",
    values: ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"],
    summary: "Decides how the Take's picture is scaled before it is placed: `contain` and `cover` keep its aspect ratio inside or across the Frame, `fit-width` and `fit-height` match one Frame edge, `native` keeps its own pixels, `scale-down` shrinks it only when it overflows, and `stretch` takes the Frame's exact size." },
  { name: "frame-x", required: false, fallback: "0.5",
    summary: "Places the anchor point across the Frame's width, as a fraction from 0 at its left edge to 1 at its right." },
  { name: "frame-y", required: false, fallback: "0.5",
    summary: "Places the anchor point down the Frame's height, as a fraction from 0 at its top edge to 1 at its bottom." },
  { name: "content-x", required: false, fallback: "0.5",
    summary: "Chooses the point across the scaled picture's width that meets the Frame's anchor, as a fraction from 0 at its left edge to 1 at its right." },
  { name: "content-y", required: false, fallback: "0.5",
    summary: "Chooses the point down the scaled picture's height that meets the Frame's anchor, as a fraction from 0 at its top edge to 1 at its bottom." },
  { name: "fit-offset-x", required: false, fallback: "0",
    summary: "Shifts the placed picture horizontally in pixels once the two anchor points meet." },
  { name: "fit-offset-y", required: false, fallback: "0",
    summary: "Shifts the placed picture vertically in pixels once the two anchor points meet." },
  { name: "fit-constraint", required: false, fallback: "bounded", values: ["bounded", "free"],
    summary: "Decides whether the placed picture is pulled back until it covers as much of the Frame as its size allows, or left exactly where the anchors and offsets put it." },
] as const;

export const speechTrackMarkupSurfaces = [{
    name: "track",
    tag: "Track",
    mode: "structured",
    outputs: [speechTrackTypes.header, speechTrackTypes.visualSpec, spatialTypes.fit,
      semanticTrackTypes.track,
      compositionTypes.visualTrack, compositionTypes.audioTrack],
    vocabulary: {
      summary: "Folds ordered SemanticTakes into one SemanticTrack, then publishes its aligned VisualTrack and AudioTrack projections.",
      appearance: "The speaking picture itself, and the layer every other Track is stacked over. Each Take's own footage fills the Frame the Track names, fitted by its Recipe, and the Takes run one after another in the order they are written, so the picture cuts from one to the next at each Take boundary with nothing between them. A Take may name its own Frame, so the picture can move or resize at a boundary; otherwise the framing holds. Nothing is drawn on top: titles, captions and cutaways are separate Tracks lying above this one.",
      preview: previewImage("Track.png"),
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this Track and prefixes every projection it publishes." },
        { name: "visual-frame", kind: "reference", required: true, accepts: [spatialTypes.frame],
          summary: "Chooses the Frame every visual Take occupies unless the Take names its own." },
        { name: "visual-appearance", kind: "reference", required: true, accepts: [svsRecipeType],
          summary: "Chooses the Recipe that fits every visual Take into its Frame unless the Take names its own.",
          recipe: visualRecipeProperties },
        { name: "visual-z", kind: "literal", required: true,
          summary: "Sets the stacking order every visual Take is composited at unless the Take names its own." },
      ],
      children: [
        { tag: "Take", cardinality: "many",
          summary: "One self-contained SemanticTake, in document order.",
          attributes: [
            { name: "source", kind: "reference", required: true, accepts: [speechTypes.semanticTake],
              summary: "Chooses the normalized and locally aligned SemanticTake this Track assembles." },
            { name: "frame", kind: "reference", required: false, accepts: [spatialTypes.frame],
              summary: "Chooses this Take's own Frame in place of the Track's `visual-frame`." },
            { name: "appearance", kind: "reference", required: false, accepts: [svsRecipeType],
              summary: "Chooses this Take's own fit Recipe in place of the Track's `visual-appearance`.",
              recipe: visualRecipeProperties },
            { name: "z", kind: "literal", required: false,
              summary: "Sets this Take's own stacking order in place of the Track's `visual-z`." },
          ] },
      ],
      ports: [
        { name: "semantic", type: semanticTrackTypes.track,
          summary: "The ordered semantic timeline whose items retain each self-contained SemanticTake." },
        { name: "visual", type: compositionTypes.visualTrack,
          summary: "The speech picture projected from the SemanticTrack, an ordinary peer VisualTrack." },
        { name: "audio", type: compositionTypes.audioTrack,
          summary: "The speech sound clips projected from the SemanticTrack, an ordinary peer AudioTrack." },
      ],
      example: `<speech:Track id="speech"
  visual-frame={speech-frame} visual-appearance={studio.speech.visual} visual-z="0">
  <speech:Take source={opening.take}/>
  <speech:Take source={closing.take}/>
</speech:Track>`,
      notes: [
        "A Track requires at least one Take and accepts no text content.",
        "`visual-appearance` and a Take's `appearance` must each be an authored SVS Recipe declaring only the spatial fit properties listed for them; any other property is refused.",
        "Media normalization, acoustic evidence and Segment alignment happen before a Take enters the Track.",
        "Placement and stacking are the complete visual authority of a Track; motion, transitions and independent pictures remain ordinary Media Tracks.",
      ],
    },
  }] as const;


export const speechTrackManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: speechTrackModuleRef.name,
  version: speechTrackModuleRef.version,
  dependencies: [
    speechDependency,
    compositionDependency,
    spatialDependency,
    { module: svsModuleRef },
    semanticTrackDependency,
  ],
  types: [
    { name: speechTrackTypes.header.name },
    { name: speechTrackTypes.trackSet.name },
    { name: speechTrackTypes.visualSpec.name },
  ],
  capabilities: [],
  producers: [
    {
      name: speechTrackProducers.createSet.name,
      inputs: [],
      outputs: [{ name: "set", type: speechTrackTypes.trackSet }],
      needs: [],
    },
    {
      name: speechTrackProducers.appendTake.name,
      inputs: [
        { name: "set", type: speechTrackTypes.trackSet },
        { name: "take", type: speechTypes.semanticTake },
        { name: "frame", type: spatialTypes.frame },
        { name: "fit", type: spatialTypes.fit },
        { name: "visualSpec", type: speechTrackTypes.visualSpec },
      ],
      outputs: [{ name: "set", type: speechTrackTypes.trackSet }],
      needs: [],
    },
    {
      name: speechTrackProducers.assembleTrack.name,
      inputs: [
        { name: "header", type: speechTrackTypes.header },
        { name: "set", type: speechTrackTypes.trackSet },
      ],
      outputs: [{ name: "track", type: semanticTrackTypes.track }],
      needs: [],
    },
    {
      name: speechTrackProducers.projectVisual.name,
      inputs: [
        { name: "track", type: semanticTrackTypes.track },
        { name: "set", type: speechTrackTypes.trackSet },
      ],
      outputs: [{ name: "visual", type: compositionTypes.visualTrack }],
      needs: [],
    },
  ],
};
