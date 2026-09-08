import { readFile } from "node:fs/promises";

import { semanticTakeSchema, speechDependency, speechTypes } from "@hypit/speech";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import {
  mediaFramePresentationSchema,
  mediaLifecycleMotionSchema,
  mediaPaintLayerSpecSchema,
  mediaSampleAppearanceSchema,
  mediaSamplingMotionSchema,
} from "@hypit/media-track";
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

export const speechTrackVisualSpecSchema: ValueSchema = object({
  stackingOrder: { schema: { kind: "number", integer: true } },
  presentation: { schema: mediaFramePresentationSchema },
  sampleAppearance: { schema: mediaSampleAppearanceSchema },
  motion: { schema: mediaLifecycleMotionSchema },
  framePaint: { schema: mediaPaintLayerSpecSchema, optional: true },
  samplingMotion: { schema: mediaSamplingMotionSchema, optional: true },
});

export const speechTrackSetSchema: ValueSchema = object({
  takes: { schema: { kind: "array", items: object({
    semantic: { schema: semanticTakeSchema },
    visual: { schema: object({
      frame: { schema: spatialFrameSchema },
      fit: { schema: contentFitSchema },
      spec: { schema: speechTrackVisualSpecSchema },
    }), optional: true },
  }) } },
});

const visualRecipeProperties = [
  { name: "fit", required: false, fallback: "contain",
    values: ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"],
    summary: "Decides how the Take's picture is scaled before it is placed: `contain` and `cover` keep its aspect ratio inside or across the Frame, `fit-width` and `fit-height` match one Frame edge, `native` keeps its own pixels, `scale-down` shrinks it only when it overflows, and `stretch` takes the Frame's exact size." },
  { name: "frame-x", required: false, fallback: "0.5",
    summary: "Places the destination alignment point across the fitting area left after border and padding, from 0 at its left edge to 1 at its right." },
  { name: "frame-y", required: false, fallback: "0.5",
    summary: "Places the destination alignment point down the fitting area left after border and padding, from 0 at its top edge to 1 at its bottom." },
  { name: "content-x", required: false, fallback: "0.5",
    summary: "Chooses the point across the scaled picture's width that meets the Frame's anchor, as a fraction from 0 at its left edge to 1 at its right." },
  { name: "content-y", required: false, fallback: "0.5",
    summary: "Chooses the point down the scaled picture's height that meets the Frame's anchor, as a fraction from 0 at its top edge to 1 at its bottom." },
  { name: "fit-offset-x", required: false, fallback: "0",
    summary: "Shifts the placed picture horizontally in pixels once the two anchor points meet." },
  { name: "fit-offset-y", required: false, fallback: "0",
    summary: "Shifts the placed picture vertically in pixels once the two anchor points meet." },
  { name: "fit-constraint", required: false, fallback: "bounded", values: ["bounded", "free"],
    summary: "With bounded, large content keeps the fitting area covered on each axis and small content stays inside it; free preserves the authored alignment and offsets. Clipping is controlled separately." },
  { name: "opacity", required: false, fallback: "1",
    summary: "Sets how opaque the Take's picture is drawn." },
  { name: "blur", required: false, fallback: "0",
    summary: "Blurs the Take's picture by a pixel radius." },
  { name: "brightness", required: false, fallback: "1",
    summary: "Scales the brightness of the Take's picture." },
  { name: "contrast", required: false, fallback: "1",
    summary: "Scales the contrast of the Take's picture." },
  { name: "saturation", required: false, fallback: "1",
    summary: "Scales the saturation of the Take's picture." },
  { name: "clip", required: false, values: ["none", "frame", "rounded"], fallback: "frame",
    summary: "Clips the Take's picture to its Frame, leaves overflow visible, or rounds the Frame." },
  { name: "radius", required: false, fallback: "0",
    summary: "Sets the rounded clip radius in pixels; half the side of a square Frame makes a circle." },
  { name: "padding", required: false, fallback: "0",
    summary: "Insets the picture's fitting area inside the border, using quoted pixel values: one for all sides, two for vertical/horizontal, or four for top/right/bottom/left." },
  { name: "border-width", required: false, fallback: "0",
    summary: "Draws a border of this pixel width around the Frame." },
  { name: "border-style", required: false, values: ["solid", "dashed", "dotted"], fallback: "solid",
    summary: "Chooses how a non-zero border is stroked." },
  { name: "border-color", required: false,
    summary: "Sets the color of a non-zero border." },
  { name: "shadows", required: false, fallback: "none",
    summary: "Casts Frame shadows written as `x y blur spread color` entries separated by semicolons." },
  { name: "frame-paint", required: false, fallback: "transparent",
    summary: "Fills the Frame behind the Take with a solid or gradient paint." },
] as const;

const visualMotionRecipeProperties = [
  { name: "enter", required: false, fallback: "none",
    values: ["none", "fade", "slide", "scale", "pop", "bounce", "blur-reveal", "wipe", "flip", "spin"],
    summary: "Chooses the visual entrance applied inside this Segment." },
  { name: "enter-frames", required: false,
    summary: "Sets the entrance length in frames when an entrance is selected." },
  { name: "enter-easing", required: false, values: ["linear", "ease-in", "ease-out", "ease-in-out"], fallback: "ease-in-out",
    summary: "Shapes the entrance's acceleration." },
  { name: "enter-direction", required: false, values: ["left", "right", "up", "down"],
    summary: "Sets the direction of a directional entrance." },
  { name: "enter-amount", required: false,
    summary: "Sets how far the entrance displaces the visual." },
  { name: "sustain", required: false, fallback: "none",
    summary: "Applies continuous visual motion over the Segment as `operator amount cycles [direction]`." },
  { name: "exit", required: false, fallback: "none",
    values: ["none", "fade", "slide", "scale", "pop", "bounce", "blur-reveal", "wipe", "flip", "spin"],
    summary: "Chooses the visual exit applied inside this Segment." },
  { name: "exit-frames", required: false,
    summary: "Sets the exit length in frames when an exit is selected." },
  { name: "exit-easing", required: false, values: ["linear", "ease-in", "ease-out", "ease-in-out"], fallback: "ease-in-out",
    summary: "Shapes the exit's acceleration." },
  { name: "exit-direction", required: false, values: ["left", "right", "up", "down"],
    summary: "Sets the direction of a directional exit." },
  { name: "exit-amount", required: false,
    summary: "Sets how far the exit displaces the visual." },
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
      appearance: "The performance picture, presented full-frame, as an inset, or as a transparent foreground cutout. Each Take is fitted into its selected Frame with optional rounded clipping, border, padding, backing and shadow. Visual-z or the Take's z sets its position among other visual Tracks. Takes run in Source order; a Take can choose its own Frame and appearance at a boundary. Lifecycle motion moves the framed presentation, while Sampling moves its picture inside the Frame. These visual choices preserve the performance's semantic time and separate audio output.",
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
        { name: "visual-motion", kind: "reference", required: false, accepts: [svsRecipeType],
          summary: "Chooses visual-only entrance, sustained motion and exit for every Take unless a Take names its own.",
          recipe: visualMotionRecipeProperties },
      ],
      children: [
        { tag: "Take", cardinality: "many",
          summary: "One self-contained SemanticTake, in document order; optional Sampling children move its picture inside the Frame.",
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
            { name: "motion", kind: "reference", required: false, accepts: [svsRecipeType],
              summary: "Chooses this Take's own visual-only motion in place of the Track's `visual-motion`.",
              recipe: visualMotionRecipeProperties },
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
  visual-frame={speech-frame} visual-appearance={recipes.speech.visual} visual-z="0">
  <speech:Take source={opening.take}/>
  <speech:Take source={closing.take}/>
</speech:Track>`,
      notes: [
        "A Track requires at least one Take and accepts no text content.",
        "`visual-appearance` and a Take's `appearance` use the shared Media Item styling listed here: fit, visual filtering, Frame paint, clipping, border and shadow.",
        "Media normalization, acoustic evidence and Segment alignment happen before a Take enters the Track.",
        "Speech visual motion changes only the projected picture inside its Segment; it does not retime the SemanticTake or its audio.",
        "A Take accepts Sampling children with the same `at`, `zoom`, `x`, `y`, `rotate` and `easing` fields as a direct Media Item; at least two keyframes cover normalized Segment progress.",
        "Playback, source trim, independent Windows, replacement Sequences and separate pictures remain ordinary Media Track concerns.",
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
