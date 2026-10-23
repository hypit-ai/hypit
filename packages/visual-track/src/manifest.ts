import { timelineDependency, timelineTypes } from "@hypit/timeline";
import type { StructuredSurfaceDeclaration, SurfaceVocabulary } from "@hypit/hypit/markup";
import type { Timeline } from "@hypit/timeline";
import { temporalContextAttributeVocabulary } from "@hypit/temporal/markup";
import { visualSourceTimeMapSchema } from "@hypit/composition";
import { readFile } from "node:fs/promises";

import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import {
  compositableSurfaceSchema,
  mediaDependency,
  mediaTypes,
} from "@hypit/media";

import { blobRefSchema } from "@hypit/hypit/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import {
  contentFitSchema,
  intrinsicExtentSchema,
  spatialDependency,
  spatialFrameSchema,
  spatialMap2DSchema,
  spatialTypes,
} from "@hypit/spatial";
import { recipeType } from "@hypit/hypit/recipe";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { temporalWindowAttributeVocabulary } from "@hypit/temporal/markup";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

export const visualTrackModuleRef = { name: "@hypit/visual-track", version: "1" } as const;
export const visualTrackTypes = {
  header: { module: visualTrackModuleRef, name: "VisualTrackHeader" },
  motion: { module: visualTrackModuleRef, name: "VisualClipMotion" },
  sourceTime: { module: visualTrackModuleRef, name: "VisualSourceTimeSpec" },
  paintLayerSpec: { module: visualTrackModuleRef, name: "MediaPaintLayerSpec" },
  sampleLayerSpec: { module: visualTrackModuleRef, name: "MediaSampleLayerSpec" },
  layerSet: { module: visualTrackModuleRef, name: "MediaLayerSet" },
  clipSpec: { module: visualTrackModuleRef, name: "VisualClipSpec" },
  set: { module: visualTrackModuleRef, name: "VisualTrackSet" },
  program: { module: visualTrackModuleRef, name: "VisualTrackProgram" },
} satisfies Record<string, TypeRef>;

export const visualTrackProducers = {
  createLayers: { module: visualTrackModuleRef, name: "create-media-layer-set" },
  appendPaintLayer: { module: visualTrackModuleRef, name: "append-media-paint-layer" },
  appendStillLayer: { module: visualTrackModuleRef, name: "append-still-media-layer" },
  appendMappedStillLayer: { module: visualTrackModuleRef, name: "append-mapped-still-media-layer" },
  appendTimedLayer: { module: visualTrackModuleRef, name: "append-timed-media-layer" },
  appendMappedTimedLayer: { module: visualTrackModuleRef, name: "append-mapped-timed-media-layer" },
  appendSurfaceLayer: { module: visualTrackModuleRef, name: "append-surface-media-layer" },
  appendMappedSurfaceLayer: { module: visualTrackModuleRef, name: "append-mapped-surface-media-layer" },
  createSet: { module: visualTrackModuleRef, name: "create-visual-track-set" },
  appendClip: { module: visualTrackModuleRef, name: "append-visual-clip" },
  bindClipPath: { module: visualTrackModuleRef, name: "bind-visual-clip-path" },
  bindMotion: { module: visualTrackModuleRef, name: "bind-visual-clip-motion" },
  finalize: { module: visualTrackModuleRef, name: "finalize-visual-track" },
  projectVisual: { module: visualTrackModuleRef, name: "project-visual-track" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const unsigned = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true } as const;
const unsignedInteger = { kind: "number", integer: true, minimum: 0 } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const blob = blobRefSchema();
const rational = object({ numerator: { schema: positiveInteger }, denominator: { schema: positiveInteger } });
const extent = intrinsicExtentSchema;
const signedRational = object({ numerator: { schema: integer }, denominator: { schema: positiveInteger } });
const sourceTimePoint = object({
  edge: { schema: { kind: "string", enum: ["start", "end"] } },
  offsetFrames: { schema: integer },
});
const sourceTimeBounds = object({ from: { schema: sourceTimePoint }, until: { schema: sourceTimePoint } });
const sourceTimeRelation: ValueSchema = { kind: "oneOf", variants: [
  object({
    kind: { schema: { kind: "literal", value: "rate" } }, target: { schema: sourceTimeBounds },
    targetAt: { schema: sourceTimePoint }, sourceAt: { schema: sourceTimePoint },
    rate: { schema: signedRational }, source: { schema: sourceTimeBounds },
    wrap: { schema: sourceTimeBounds, optional: true },
  }),
  object({
    kind: { schema: { kind: "literal", value: "fit" } }, target: { schema: sourceTimeBounds },
    source: { schema: sourceTimeBounds },
  }),
] };
export const visualSourceTimeSpecSchema: ValueSchema = object({
  relations: { schema: { kind: "array", minItems: 1, items: sourceTimeRelation } },
});
const stops = { kind: "array", minItems: 2, items: object({ offset: { schema: unsigned }, color: { schema: string } }) } as const;
const paint: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "solid" } }, color: { schema: string } }),
  object({ kind: { schema: { kind: "literal", value: "linear-gradient" } }, angleDeg: { schema: number }, stops: { schema: stops } }),
  object({ kind: { schema: { kind: "literal", value: "radial-gradient" } }, center: { schema: object({ x: { schema: unsigned }, y: { schema: unsigned } }) }, stops: { schema: stops } }),
] };
export const mediaSampleAppearanceSchema: ValueSchema = object({
  opacity: { schema: unsigned },
  filter: { schema: object({
    blurPx: { schema: unsigned }, brightness: { schema: unsigned }, contrast: { schema: unsigned }, saturation: { schema: unsigned },
  }) },
});
const samplingKeyframe = object({
  atProgress: { schema: { kind: "number", minimum: 0, maximum: 1 } }, zoom: { schema: { kind: "number", minimum: 0.000001 } },
  offsetX: { schema: number }, offsetY: { schema: number }, rotationDeg: { schema: number },
  easing: { schema: { kind: "string", enum: ["linear", "ease-in", "ease-out", "ease-in-out"] }, optional: true },
});
export const mediaSamplingMotionSchema: ValueSchema = object({
  keyframes: { schema: { kind: "array", minItems: 2, items: samplingKeyframe } },
});
export const mediaPaintLayerSpecSchema: ValueSchema = object({

  id: { schema: string }, paint: { schema: paint }, opacity: { schema: unsigned },
});
export const mediaSampleLayerSpecSchema: ValueSchema = object({

  id: { schema: string }, sourceTime: { schema: visualSourceTimeSpecSchema, optional: true },
  appearance: { schema: mediaSampleAppearanceSchema }, samplingMotion: { schema: mediaSamplingMotionSchema, optional: true },
});
const visualSource: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "still" } }, artifact: { schema: blob }, extent: { schema: extent } }),
  object({
    kind: { schema: { kind: "literal", value: "timed" } }, artifact: { schema: blob }, extent: { schema: extent },
    frameRate: { schema: rational }, frameCount: { schema: positiveInteger },
  }),
  object({ kind: { schema: { kind: "literal", value: "surface" } }, surface: { schema: compositableSurfaceSchema }, extent: { schema: extent } }),
] };
const paintLayer = object({ id: { schema: string }, kind: { schema: { kind: "literal", value: "paint" } }, paint: { schema: paint }, opacity: { schema: unsigned } });
const sampleLayer = object({
  id: { schema: string }, kind: { schema: { kind: "literal", value: "sample" } }, source: { schema: visualSource },
  sourceTime: { schema: { kind: "oneOf", variants: [
    object({ kind: { schema: { kind: "literal", value: "spec" } }, value: { schema: visualSourceTimeSpecSchema } }),
    object({ kind: { schema: { kind: "literal", value: "map" } }, value: { schema: visualSourceTimeMapSchema } }),
  ] }, optional: true },
  placement: { schema: { kind: "oneOf", variants: [
    object({ kind: { schema: { kind: "literal", value: "fit" } }, fit: { schema: contentFitSchema } }),
    object({ kind: { schema: { kind: "literal", value: "mapping" } }, mapping: { schema: spatialMap2DSchema } }),
  ] } },
  appearance: { schema: mediaSampleAppearanceSchema }, samplingMotion: { schema: mediaSamplingMotionSchema, optional: true },
});
const layer = { kind: "oneOf", variants: [paintLayer, sampleLayer] } as const;
export const mediaLayerSetSchema: ValueSchema = object({

  layers: { schema: { kind: "array", items: layer } },
});
const resolvedSampleLayer = object({
  id: { schema: string }, kind: { schema: { kind: "literal", value: "sample" } }, source: { schema: visualSource },
  sourceTime: { schema: { kind: "oneOf", variants: [
    object({ kind: { schema: { kind: "literal", value: "spec" } }, value: { schema: visualSourceTimeSpecSchema } }),
    object({ kind: { schema: { kind: "literal", value: "map" } }, value: { schema: visualSourceTimeMapSchema } }),
  ] }, optional: true },
  mapping: { schema: spatialMap2DSchema },
  appearance: { schema: mediaSampleAppearanceSchema }, samplingMotion: { schema: mediaSamplingMotionSchema, optional: true },
});
const resolvedLayer = { kind: "oneOf", variants: [paintLayer, resolvedSampleLayer] } as const;

const path = { kind: "object", fields: {}, allowUnknown: true } as const;
const clip: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "none" } } }),
  object({ kind: { schema: { kind: "literal", value: "frame" } } }),
  object({ kind: { schema: { kind: "literal", value: "rounded" } }, radiusPx: { schema: unsigned } }),
  object({ kind: { schema: { kind: "literal", value: "path" } }, path: { schema: path } }),
] };
const padding = object({ topPx: { schema: unsigned }, rightPx: { schema: unsigned }, bottomPx: { schema: unsigned }, leftPx: { schema: unsigned } });
export const visualFrameTreatmentSchema: ValueSchema = object({
  clip: { schema: clip }, padding: { schema: padding },
  border: { schema: object({ widthPx: { schema: unsigned }, style: { schema: { kind: "string", enum: ["solid", "dashed", "dotted"] } }, color: { schema: string } }), optional: true },
  shadows: { schema: { kind: "array", items: object({ offsetX: { schema: number }, offsetY: { schema: number }, blurPx: { schema: unsigned }, spreadPx: { schema: number }, color: { schema: string } }) } },
});
const motionPosition: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "progress" } }, value: { schema: { kind: "number", minimum: 0, maximum: 1 } } }),
  object({ kind: { schema: { kind: "literal", value: "start" } }, offsetFrames: { schema: unsignedInteger } }),
  object({ kind: { schema: { kind: "literal", value: "end" } }, offsetFrames: { schema: { kind: "number", integer: true, maximum: 0 } } }),
] };
const poseKeyframe = object({
  at: { schema: motionPosition }, translateX: { schema: number }, translateY: { schema: number },
  scaleX: { schema: { kind: "number", minimum: 0.000001 } }, scaleY: { schema: { kind: "number", minimum: 0.000001 } },
  rotationDeg: { schema: number }, opacity: { schema: { kind: "number", minimum: 0, maximum: 1 } },
  originX: { schema: { kind: "number", minimum: 0, maximum: 1 } }, originY: { schema: { kind: "number", minimum: 0, maximum: 1 } },
  easing: { schema: { kind: "string", enum: ["linear", "ease-in", "ease-out", "ease-in-out"] }, optional: true },
});
export const visualClipMotionSchema: ValueSchema = object({
  keyframes: { schema: { kind: "array", minItems: 2, items: poseKeyframe } },
});
export const visualClipSpecSchema: ValueSchema = object({
  id: { schema: string },
  treatment: { schema: visualFrameTreatmentSchema }, motion: { schema: visualClipMotionSchema, optional: true },
});
const frameSpan = object({ startFrame: { schema: unsignedInteger }, endFrameExclusive: { schema: positiveInteger } });
const resolvedClip = object({
  id: { schema: string }, subjectId: { schema: string }, span: { schema: frameSpan }, frame: { schema: spatialFrameSchema },
  treatment: { schema: visualFrameTreatmentSchema }, layers: { schema: { kind: "array", minItems: 1, items: resolvedLayer } }, motion: { schema: visualClipMotionSchema, optional: true },
});
export const visualTrackSetSchema: ValueSchema = object({
  clips: { schema: { kind: "array", items: resolvedClip } },
});
export const visualTrackProgramSchema: ValueSchema = object({
  id: { schema: string },
  clips: { schema: { kind: "array", items: resolvedClip } },
});
export const visualTrackHeaderSchema: ValueSchema = object({
  id: { schema: string },
});

const clipInputs = [
  { name: "set", type: visualTrackTypes.set }, { name: "header", type: visualTrackTypes.header },
  { name: "timeline", type: timelineTypes.timeline },
  { name: "layers", type: visualTrackTypes.layerSet },
  { name: "frame", type: spatialTypes.frame }, { name: "spec", type: visualTrackTypes.clipSpec },
  { name: "window", type: temporalTypes.window },
] as const;

const treatmentRecipeProperties = [
  { name: "opacity", required: false, fallback: "1",
    summary: "Sets how opaque the sampled picture is drawn." },
  { name: "blur", required: false, fallback: "0",
    summary: "Blurs the sampled picture by a pixel radius." },
  { name: "brightness", required: false, fallback: "1",
    summary: "Scales the brightness of the sampled picture." },
  { name: "contrast", required: false, fallback: "1",
    summary: "Scales the contrast of the sampled picture." },
  { name: "saturation", required: false, fallback: "1",
    summary: "Scales the saturation of the sampled picture." },
  { name: "clip", required: false, values: ["none", "frame", "rounded"], fallback: "frame",
    summary: "Decides how the picture is clipped to the Frame." },
  { name: "radius", required: false, fallback: "0",
    summary: "Rounds the clipped corners by a pixel radius, and is read only for a `rounded` clip." },
  { name: "padding", required: false, fallback: "0",
    summary: "Insets the picture from the Frame edges. It accepts one, two or four values — all sides, then vertical and horizontal, then each side — which no single number can carry, so it is written as text: `padding: \"14\"` and `padding: \"8 12\"`. A bare number is refused." },
  { name: "border-width", required: false, fallback: "0",
    summary: "Draws a border of this pixel width, and draws none at `0`." },
  { name: "border-style", required: false, values: ["solid", "dashed", "dotted"], fallback: "solid",
    summary: "Chooses how the border is stroked." },
  { name: "border-color", required: false,
    summary: "Paints the border, which a non-zero `border-width` requires." },
  { name: "shadows", required: false, fallback: "none",
    summary: "Casts shadows behind the Frame, written as `x y blur spread color` entries separated by semicolons." },
  { name: "frame-paint", required: false, fallback: "transparent",
    summary: "Fills the whole Frame behind every layer with a color, `linear(angle;stops)` or `radial(x,y;stops)`." },
] as const;

export const visualTrackMarkupSurfaces: readonly (StructuredSurfaceDeclaration & { readonly vocabulary: SurfaceVocabulary })[] = [{
    name: "track", tag: "Track", mode: "structured",
    outputs: [spatialTypes.fit, visualTrackTypes.header, visualTrackTypes.paintLayerSpec, visualTrackTypes.sampleLayerSpec,
      visualTrackTypes.layerSet, visualTrackTypes.clipSpec, visualTrackTypes.set,
      visualTrackTypes.program,
      compositionTypes.visualTrack],
    vocabulary: {
      summary: "Places ordinary visual Clips on one completed Timeline; Film places the resulting Track in a VisualScope.",
      appearance: "Each Clip owns one source, one absolute Window and one Frame. Source-time, space, treatment and optional local motion remain independent choices.",
      preview: previewImage("Track.png"),
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this Track and prefixes the identity of every Clip and layer that does not name itself." },
        ...temporalContextAttributeVocabulary,
      ],
      children: [
        { tag: "Clip", cardinality: "many",
          summary: "One independently timed source on its own Frame, optionally carrying Sampling and Pose keyframes.",
          attributes: [
            { name: "id", kind: "identifier", required: false,
              summary: "Names this Clip; the Track derives `<track>.clip.<index>` when it is absent." },
            { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame],
              summary: "Chooses the Frame the Clip occupies in the program picture plane." },
            { name: "treatment", kind: "reference", required: false, accepts: [recipeType],
              summary: "Optionally chooses reusable image and Frame treatment; timing and fitting do not belong to it.",
              recipe: treatmentRecipeProperties },
            { name: "motion", kind: "reference", required: false, accepts: [visualTrackTypes.motion],
              summary: "Optionally applies a reusable typed Motion. Inline Pose children express the same value." },
            { name: "clip", kind: "reference", required: false, accepts: [spatialTypes.path],
              summary: "Clips the Clip to an authored Path." },
            { name: "image", kind: "reference", required: false, accepts: [blobTypes.blob],
              summary: "Shows a durationless still image as the Clip's direct source." },
            { name: "media", kind: "reference", required: false, accepts: [mediaTypes.synchronized],
              summary: "Shows an explicitly prepared timed source." },
            { name: "surface", kind: "reference", required: false, accepts: [mediaTypes.compositableSurface],
              summary: "Shows an alpha-aware still or timed Surface." },
            { name: "source-time", kind: "reference", required: false, accepts: [visualTrackTypes.sourceTime],
              summary: "Applies one reusable partial source-time relation. Inline Map children express the same value." },
            { name: "extent", kind: "reference", required: false, accepts: [spatialTypes.extent],
              summary: "Gives the still image its authored pixel Extent. The `fit` scales this Extent into the Frame, so what it decides is the shape: its width-to-height ratio has to be the picture's, and the pixel numbers themselves only have to hold that ratio. A generated picture's own size is the generator's to choose and is not knowable when the Source is written, so write the ratio you asked that generator for." },
            { name: "mapping", kind: "reference", required: false, accepts: [spatialTypes.map2D],
              summary: "Uses one explicit affine map from source-local pixels into the program picture plane instead of deriving one from fit attributes." },
            { name: "fit", kind: "literal", required: false,
              values: ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"],
              summary: "Chooses contain, cover, fit-width, fit-height, native, scale-down or stretch; defaults to contain." },
            { name: "frame-x", kind: "literal", required: false, summary: "Sets normalized horizontal destination alignment." },
            { name: "frame-y", kind: "literal", required: false, summary: "Sets normalized vertical destination alignment." },
            { name: "content-x", kind: "literal", required: false, summary: "Sets normalized horizontal source anchor." },
            { name: "content-y", kind: "literal", required: false, summary: "Sets normalized vertical source anchor." },
            { name: "fit-offset-x", kind: "literal", required: false, summary: "Offsets fitted content horizontally in pixels." },
            { name: "fit-offset-y", kind: "literal", required: false, summary: "Offsets fitted content vertically in pixels." },
            { name: "fit-constraint", kind: "literal", required: false, values: ["bounded", "free"], summary: "Chooses bounded or free alignment." },
            ...temporalWindowAttributeVocabulary,
          ] },
      ],
      ports: [
        { name: "program", type: visualTrackTypes.program,
          summary: "The resolved authored Clips retained for declared consumers such as Studio." },
        { name: "visual", type: compositionTypes.visualTrack,
          summary: "The rendered picture, an ordinary peer VisualTrack." },
      ],
      example: `<visual:Motion id="gentle-push">
  <visual:Pose at="start" scale="1.08" easing="ease-out"/>
  <visual:Pose at="end" scale="1"/>
</visual:Motion>

<visual:Track id="cutaways" timeline={speech.timeline}>
  <visual:Clip media={prepared.media} during={program.window} frame={full} fit="cover"/>
  <visual:Clip id="bags" media={cutaway-bags.media} during={bags}
    frame={full} fit="cover" treatment={recipes.visual.cutaway} motion={gentle-push}/>
</visual:Track>`,
      notes: [
        "A Track requires at least one Clip and accepts no text content.",
        "A Clip references one already resolved Window through `during`.",
        "A Clip names exactly one of `image`, `media` or `surface`; `extent` is required with `image` and refused otherwise.",
        "The parent Film Scope owns this Track occurrence's position through sibling declaration order; fitting and source time remain properties of each Clip occurrence.",
        "An explicit `mapping` is mutually exclusive with every fit attribute. It is already in program-picture coordinates; the Frame still owns clipping and treatment.",
        "Omitting source time means bounded partial identity. Map children are refused on durationless still material.",
        "Map children control timed source coordinates, Sampling children animate source crop inside the Frame, and Pose children animate the complete framed Clip.",
        "Audio is authored independently through Audio Track; Visual Track never selects or emits it implicitly.",
      ],
    },
  }, {
    name: "motion", tag: "Motion", mode: "structured",
    outputs: [visualTrackTypes.motion],
    vocabulary: {
      summary: "Authors one reusable Clip-local affine and opacity Motion without naming an aesthetic effect.",
      attributes: [{ name: "id", kind: "identifier", required: true, summary: "Names this Motion value." }],
      children: [{
        tag: "Pose", cardinality: "many", summary: "One complete visual state on the consuming Clip's local clock.",
        attributes: [
          { name: "at", kind: "literal", required: true, summary: "Places this state at start, end, Nf, end-Nf or a percentage." },
          { name: "x", kind: "literal", required: false, summary: "Translates horizontally in picture pixels." },
          { name: "y", kind: "literal", required: false, summary: "Translates vertically in picture pixels." },
          { name: "scale", kind: "literal", required: false, summary: "Scales both axes." },
          { name: "scale-x", kind: "literal", required: false, summary: "Scales the horizontal axis." },
          { name: "scale-y", kind: "literal", required: false, summary: "Scales the vertical axis." },
          { name: "rotate", kind: "literal", required: false, summary: "Rotates in degrees." },
          { name: "opacity", kind: "literal", required: false, summary: "Sets opacity inside [0,1]." },
          { name: "origin-x", kind: "literal", required: false, summary: "Sets normalized horizontal transform origin." },
          { name: "origin-y", kind: "literal", required: false, summary: "Sets normalized vertical transform origin." },
          { name: "easing", kind: "literal", required: false, summary: "Shapes the interval leaving this Pose." },
        ],
      }],
      example: `<visual:Motion id="gentle-push">
  <visual:Pose at="start" scale="1.08" easing="ease-out"/>
  <visual:Pose at="end" scale="1"/>
</visual:Motion>`,
      notes: ["A Motion needs at least two ordered Poses and must resolve from the consuming Clip's start through its end."],
    },
  }, {
    name: "source-time", tag: "SourceTime", mode: "structured",
    outputs: [visualTrackTypes.sourceTime],
    vocabulary: {
      summary: "Authors a reusable partial relation from Clip-local target frames to source-local frames.",
      attributes: [{ name: "id", kind: "identifier", required: true, summary: "Names this SourceTime relation." }],
      children: [{
        tag: "Map", cardinality: "many", summary: "One affine piece; uncovered target frames are transparent.",
        attributes: [
          { name: "target-from", kind: "literal", required: false, summary: "Starts the target interval; defaults to start." },
          { name: "target-until", kind: "literal", required: false, summary: "Ends the target interval exclusively; defaults to end." },
          { name: "target-at", kind: "literal", required: false, summary: "Names the target anchor paired with source-at." },
          { name: "source-at", kind: "literal", required: false, summary: "Names the source anchor paired with target-at." },
          { name: "rate", kind: "literal", required: false, summary: "Exact signed source frames per target frame." },
          { name: "source-from", kind: "literal", required: false, summary: "Starts the permitted or fitted source interval." },
          { name: "source-until", kind: "literal", required: false, summary: "Ends the permitted or fitted source interval exclusively." },
          { name: "wrap-from", kind: "literal", required: false, summary: "Starts an explicitly periodic source interval." },
          { name: "wrap-until", kind: "literal", required: false, summary: "Ends an explicitly periodic source interval exclusively." },
        ],
      }],
      example: `<visual:SourceTime id="native-loop">
  <visual:Map source-at="start" rate="1" wrap-from="start" wrap-until="end"/>
</visual:SourceTime>`,
      notes: [
        "Without rate, anchors or wrap, a Map fits source-from..source-until across its target interval.",
        "With rate or anchors, missing points default to start and missing bounds default to the complete domain.",
      ],
    },
  }] as const;


export const visualTrackManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: visualTrackModuleRef.name,
  version: visualTrackModuleRef.version,
  dependencies: [
    blobDependency,
    mediaDependency,
    timelineDependency,
    temporalDependency,
    spatialDependency,
    compositionDependency,
  ],
  types: [
    visualTrackTypes.header.name,
    visualTrackTypes.motion.name,
    visualTrackTypes.sourceTime.name,
    visualTrackTypes.paintLayerSpec.name,
    visualTrackTypes.sampleLayerSpec.name,
    visualTrackTypes.layerSet.name,
    visualTrackTypes.clipSpec.name,
    visualTrackTypes.set.name,
    visualTrackTypes.program.name,
  ],
  capabilities: [],
  producers: [
    { name: visualTrackProducers.createLayers.name, inputs: [], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.appendPaintLayer.name, inputs: [{ name: "layers", type: visualTrackTypes.layerSet }, { name: "spec", type: visualTrackTypes.paintLayerSpec }], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.appendStillLayer.name, inputs: [{ name: "layers", type: visualTrackTypes.layerSet }, { name: "source", type: blobTypes.blob }, { name: "extent", type: spatialTypes.extent }, { name: "fit", type: spatialTypes.fit }, { name: "spec", type: visualTrackTypes.sampleLayerSpec }], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.appendMappedStillLayer.name, inputs: [{ name: "layers", type: visualTrackTypes.layerSet }, { name: "source", type: blobTypes.blob }, { name: "extent", type: spatialTypes.extent }, { name: "mapping", type: spatialTypes.map2D }, { name: "spec", type: visualTrackTypes.sampleLayerSpec }], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.appendTimedLayer.name, inputs: [{ name: "layers", type: visualTrackTypes.layerSet }, { name: "source", type: mediaTypes.synchronized }, { name: "fit", type: spatialTypes.fit }, { name: "spec", type: visualTrackTypes.sampleLayerSpec }], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.appendMappedTimedLayer.name, inputs: [{ name: "layers", type: visualTrackTypes.layerSet }, { name: "source", type: mediaTypes.synchronized }, { name: "mapping", type: spatialTypes.map2D }, { name: "spec", type: visualTrackTypes.sampleLayerSpec }], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.appendSurfaceLayer.name, inputs: [{ name: "layers", type: visualTrackTypes.layerSet }, { name: "source", type: mediaTypes.compositableSurface }, { name: "fit", type: spatialTypes.fit }, { name: "spec", type: visualTrackTypes.sampleLayerSpec }], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.appendMappedSurfaceLayer.name, inputs: [{ name: "layers", type: visualTrackTypes.layerSet }, { name: "source", type: mediaTypes.compositableSurface }, { name: "mapping", type: spatialTypes.map2D }, { name: "spec", type: visualTrackTypes.sampleLayerSpec }], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.createSet.name, inputs: [], result: { kind: "output" as const, name: "set", type: visualTrackTypes.set } },
    { name: visualTrackProducers.appendClip.name, inputs: clipInputs, result: { kind: "output" as const, name: "set", type: visualTrackTypes.set } },
    { name: visualTrackProducers.bindClipPath.name, inputs: [{ name: "spec", type: visualTrackTypes.clipSpec }, { name: "path", type: spatialTypes.path }], result: { kind: "output" as const, name: "spec", type: visualTrackTypes.clipSpec } },
    { name: visualTrackProducers.bindMotion.name, inputs: [{ name: "spec", type: visualTrackTypes.clipSpec }, { name: "motion", type: visualTrackTypes.motion }], result: { kind: "output" as const, name: "spec", type: visualTrackTypes.clipSpec } },
    { name: visualTrackProducers.finalize.name, inputs: [{ name: "set", type: visualTrackTypes.set }, { name: "header", type: visualTrackTypes.header }, { name: "timeline", type: timelineTypes.timeline }], result: { kind: "output" as const, name: "program", type: visualTrackTypes.program } },
    { name: visualTrackProducers.projectVisual.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "program", type: visualTrackTypes.program }], result: { kind: "output" as const, name: "track", type: compositionTypes.visualTrack } },
  ],
};

export const visualTrackDependency = visualTrackModuleRef;
