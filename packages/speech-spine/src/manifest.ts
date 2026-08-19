import { readFile } from "node:fs/promises";

import { artifactDependency, artifactTypes } from "@hypit/artifact";
import { narrativeDependency, narrativeExcerptSchema, narrativeTypes } from "@hypit/narrative";
import { mediaDependency, mediaTypes, synchronizedMediaSchema } from "@hypit/media";
import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import { speechDependency, speechTypes } from "@hypit/speech";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import {
  mediaPipelineManifest,
  mediaPipelineModuleRef,
  mediaPipelineTypes,
} from "@hypit/media-pipeline";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { speechBasisManifest, speechBasisModuleRef } from "@hypit/speech-basis";
import {
  contentFitSchema,
  spatialDependency,
  spatialFrameSchema,
  spatialTypes,
} from "@hypit/spatial";
import { svsManifest, svsModuleRef, svsRecipeType } from "@hypit/svs";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

export const speechSpineModuleRef = { name: "@hypit/speech-spine", version: "1" } as const;
export const speechSpineTypes = {
  spineProgram: { module: speechSpineModuleRef, name: "SpeechSpineProgram" },
  spineSet: { module: speechSpineModuleRef, name: "SpeechSpineSet" },
  visualSpec: { module: speechSpineModuleRef, name: "SpeechSpineVisualSpec" },
} satisfies Record<string, TypeRef>;
export const speechSpineProducers = {
  createSet: { module: speechSpineModuleRef, name: "create-spine-set" },
  appendAudioTake: { module: speechSpineModuleRef, name: "append-spine-audio-take" },
  appendVisualTake: { module: speechSpineModuleRef, name: "append-spine-visual-take" },
  compileAudio: { module: speechSpineModuleRef, name: "compile-spine-audio" },
  assembleBasis: { module: speechSpineModuleRef, name: "assemble-speech-basis" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true, minimum: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({
  kind: "object",
  fields,
});
const frameRate = object({ numerator: { schema: integer }, denominator: { schema: integer } });

export const speechSpineProgramSchema: ValueSchema = object({

  id: { schema: string },
  frameRate: { schema: frameRate },
});

export const speechSpineSetSchema: ValueSchema = object({

  takes: { schema: { kind: "array", items: object({
    segment: { schema: narrativeExcerptSchema },
    media: { schema: synchronizedMediaSchema },
    visual: { schema: object({
      frame: { schema: spatialFrameSchema },
      fit: { schema: contentFitSchema },
      stackingOrder: { schema: { kind: "number", integer: true } },
    }), optional: true },
  }) } },
});

export const speechSpineVisualSpecSchema: ValueSchema = object({

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

export const speechSpineMarkupSurfaces = [{
    name: "spine",
    tag: "Spine",
    mode: "structured",
    outputs: [speechSpineTypes.spineProgram, speechSpineTypes.visualSpec, spatialTypes.fit,
      mediaPipelineTypes.selectionRequest,
      speechTypes.basis, programSpaceTypes.programSpace, speechTypes.audioBasis,
      compositionTypes.visualTrack, compositionTypes.audioTrack],
    vocabulary: {
      summary: "Folds ordered speech Takes into one SpeechBasis, and publishes the ProgramSpace every other Track is timed against together with the peer VisualTrack and AudioTrack the speech renders to.",
      appearance: "The speaking picture itself, and the layer every other Track is stacked over. Each Take's own footage fills the Frame the Spine names, fitted by its Recipe, and the Takes run one after another in the order they are written, so the picture cuts from one to the next at each Take boundary with nothing between them. A Take may name its own Frame, so the picture can move or resize at a boundary; otherwise the framing holds. Nothing is drawn on top: titles, captions and cutaways are separate Tracks lying above this one.",
      preview: previewImage("Spine.png"),
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this Spine and prefixes the Program, the media normalization and every binding it publishes." },
        { name: "frame-rate", kind: "literal", required: true,
          summary: "Fixes the frame rate every Take is normalized to and the ProgramSpace is measured in, written as a positive rational such as 30 or 30000/1001." },
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
          summary: "One spoken Segment and the single source that performs it, in document order.",
          attributes: [
            { name: "segment", kind: "reference", required: true, accepts: [narrativeTypes.excerpt],
              summary: "Chooses the spoken Segment this Take performs." },
            { name: "video", kind: "reference", required: false, accepts: [artifactTypes.blob],
              summary: "Performs the Segment from a raw video the Surface inspects, selects and normalizes before assembly." },
            { name: "audio", kind: "reference", required: false, accepts: [artifactTypes.blob],
              summary: "Performs the Segment from a voice recording normalized audio-authoritatively, contributing no visual clip." },
            { name: "media", kind: "reference", required: false, accepts: [mediaTypes.synchronized],
              summary: "Performs the Segment from an already prepared timed source, connected directly." },
            { name: "frame", kind: "reference", required: false, accepts: [spatialTypes.frame],
              summary: "Chooses this Take's own Frame in place of the Spine's `visual-frame`." },
            { name: "appearance", kind: "reference", required: false, accepts: [svsRecipeType],
              summary: "Chooses this Take's own fit Recipe in place of the Spine's `visual-appearance`.",
              recipe: visualRecipeProperties },
            { name: "z", kind: "literal", required: false,
              summary: "Sets this Take's own stacking order in place of the Spine's `visual-z`." },
          ] },
      ],
      ports: [
        { name: "basis", type: speechTypes.basis,
          summary: "The assembled SpeechBasis: the ordered Takes, their placed audio and their visual clips." },
        { name: "space", type: programSpaceTypes.programSpace,
          summary: "The speech coordinate space, the frame domain every other Track resolves its windows in." },
        { name: "audio", type: speechTypes.audioBasis,
          summary: "The rendered speech audio, as the timed basis measurement and captioning read." },
        { name: "visual", type: compositionTypes.visualTrack,
          summary: "The rendered speech picture, an ordinary peer VisualTrack." },
        { name: "audioTrack", type: compositionTypes.audioTrack,
          summary: "The rendered speech sound, an ordinary peer AudioTrack." },
      ],
      example: `<speech:Spine id="speech" frame-rate="30"
  visual-frame={speech-frame} visual-appearance={studio.speech.visual} visual-z="0">
  <speech:Take video={take-opening.video} segment={story.segment.opening}/>
  <speech:Take video={take-closing.video} segment={story.segment.closing}/>
</speech:Spine>`,
      notes: [
        "A Spine requires at least one Take and accepts no text content.",
        "`visual-appearance` and a Take's `appearance` must each be an authored SVS Recipe declaring only the spatial fit properties listed for them; any other property is refused.",
        "A Take states exactly one of `video`, `audio` or `media`; an `audio` Take is refused `frame`, `appearance` and `z`.",
        "Placement and stacking are the complete visual authority of a Spine; motion, transitions and independent pictures remain ordinary Media Tracks.",
      ],
    },
  }] as const;


export const speechSpineManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: speechSpineModuleRef.name,
  version: speechSpineModuleRef.version,
  dependencies: [
    artifactDependency,
    narrativeDependency,
    mediaDependency,
    programSpaceDependency,
    speechDependency,
    compositionDependency,
    spatialDependency,
    { module: svsModuleRef },
    { module: mediaPipelineModuleRef },
    { module: speechBasisModuleRef },
  ],
  types: [
    { name: speechSpineTypes.spineProgram.name },
    { name: speechSpineTypes.spineSet.name },
    { name: speechSpineTypes.visualSpec.name },
  ],
  capabilities: [],
  producers: [
    {
      name: speechSpineProducers.createSet.name,
      inputs: [],
      outputs: [{ name: "set", type: speechSpineTypes.spineSet }],
      needs: [],
    },
    {
      name: speechSpineProducers.appendAudioTake.name,
      inputs: [
        { name: "set", type: speechSpineTypes.spineSet },
        { name: "program", type: speechSpineTypes.spineProgram },
        { name: "media", type: mediaTypes.synchronized },
        { name: "segment", type: narrativeTypes.excerpt },
      ],
      outputs: [{ name: "set", type: speechSpineTypes.spineSet }],
      needs: [],
    },
    {
      name: speechSpineProducers.appendVisualTake.name,
      inputs: [
        { name: "set", type: speechSpineTypes.spineSet },
        { name: "program", type: speechSpineTypes.spineProgram },
        { name: "media", type: mediaTypes.synchronized },
        { name: "segment", type: narrativeTypes.excerpt },
        { name: "frame", type: spatialTypes.frame },
        { name: "fit", type: spatialTypes.fit },
        { name: "visualSpec", type: speechSpineTypes.visualSpec },
      ],
      outputs: [{ name: "set", type: speechSpineTypes.spineSet }],
      needs: [],
    },
    {
      name: speechSpineProducers.compileAudio.name,
      inputs: [
        { name: "program", type: speechSpineTypes.spineProgram },
        { name: "set", type: speechSpineTypes.spineSet },
      ],
      outputs: [{ name: "plan", type: mediaPipelineTypes.audioProgramPlan }],
      needs: [],
    },
    {
      name: speechSpineProducers.assembleBasis.name,
      inputs: [
        { name: "program", type: speechSpineTypes.spineProgram },
        { name: "set", type: speechSpineTypes.spineSet },
        { name: "audio", type: mediaTypes.timelineAudio },
      ],
      outputs: [{ name: "basis", type: speechTypes.basis }],
      needs: [],
    },
  ],
};
