import { readFile } from "node:fs/promises";

import { artifactDependency, artifactTypes } from "@hypit/artifact";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import {
  compositableSurfaceSchema,
  mediaDependency,
  mediaTypes,
} from "@hypit/media";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { semanticTrackDependency, semanticTrackTypes } from "@hypit/semantic-track";
import {
  contentFitSchema,
  intrinsicExtentSchema,
  spatialDependency,
  spatialFrameSchema,
  spatialTypes,
} from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { temporalWindowAttributeVocabulary } from "@hypit/temporal-markup";

const previewImage = (file: string) => ({
  mediaType: "image/png",
  path: `preview/${file}`,
  open: async () => Uint8Array.from(await readFile(new URL(`../preview/${file}`, import.meta.url))),
});

export const mediaTrackModuleRef = { name: "@hypit/media-track", version: "1" } as const;
export const mediaTrackTypes = {
  header: { module: mediaTrackModuleRef, name: "MediaTrackHeader" },
  paintLayerSpec: { module: mediaTrackModuleRef, name: "MediaPaintLayerSpec" },
  sampleLayerSpec: { module: mediaTrackModuleRef, name: "MediaSampleLayerSpec" },
  layerSet: { module: mediaTrackModuleRef, name: "MediaLayerSet" },
  soundSpec: { module: mediaTrackModuleRef, name: "MediaSoundSpec" },
  soundSet: { module: mediaTrackModuleRef, name: "MediaSoundSet" },
  itemSpec: { module: mediaTrackModuleRef, name: "MediaItemSpec" },
  memberSpec: { module: mediaTrackModuleRef, name: "MediaSequenceMemberSpec" },
  memberSet: { module: mediaTrackModuleRef, name: "MediaSequenceMemberSet" },
  handoffSpec: { module: mediaTrackModuleRef, name: "MediaHandoffSpec" },
  sequenceSpec: { module: mediaTrackModuleRef, name: "MediaSequenceSpec" },
  set: { module: mediaTrackModuleRef, name: "MediaTrackSet" },
  program: { module: mediaTrackModuleRef, name: "MediaTrackProgram" },
} satisfies Record<string, TypeRef>;

export const mediaTrackProducers = {
  createLayers: { module: mediaTrackModuleRef, name: "create-media-layer-set" },
  appendPaintLayer: { module: mediaTrackModuleRef, name: "append-media-paint-layer" },
  appendStillLayer: { module: mediaTrackModuleRef, name: "append-still-media-layer" },
  appendTimedLayer: { module: mediaTrackModuleRef, name: "append-timed-media-layer" },
  appendSurfaceLayer: { module: mediaTrackModuleRef, name: "append-surface-media-layer" },
  createSounds: { module: mediaTrackModuleRef, name: "create-media-sound-set" },
  appendSound: { module: mediaTrackModuleRef, name: "append-media-sound" },
  createSet: { module: mediaTrackModuleRef, name: "create-media-track-set" },
  appendItem: { module: mediaTrackModuleRef, name: "append-media-item" },
  bindItemClipPath: { module: mediaTrackModuleRef, name: "bind-media-item-clip-path" },
  bindSequenceClipPath: { module: mediaTrackModuleRef, name: "bind-media-sequence-clip-path" },
  createMembers: { module: mediaTrackModuleRef, name: "create-media-sequence-member-set" },
  appendMember: { module: mediaTrackModuleRef, name: "append-media-sequence-member" },
  appendSequence: { module: mediaTrackModuleRef, name: "append-media-sequence" },
  finalize: { module: mediaTrackModuleRef, name: "finalize-media-track" },
  projectVisual: { module: mediaTrackModuleRef, name: "project-media-visual-track" },
  projectAudio: { module: mediaTrackModuleRef, name: "project-media-audio-track" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const unsigned = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true } as const;
const unsignedInteger = { kind: "number", integer: true, minimum: 0 } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const blob = object({
  kind: { schema: { kind: "literal", value: "blob" } },
  resource: { schema: { kind: "string", minLength: 5, maxLength: 256 } },
  size: { schema: unsignedInteger },
  mediaType: { schema: string },
});
const rational = object({ numerator: { schema: positiveInteger }, denominator: { schema: positiveInteger } });
const extent = intrinsicExtentSchema;
const trim = object({ startFrame: { schema: unsignedInteger }, endFrameExclusive: { schema: positiveInteger } });
const occupancy: ValueSchema = { kind: "oneOf", variants: [
  ...["once", "hold", "loop"].map((mode) => object({
    mode: { schema: { kind: "literal", value: mode } },
    align: { schema: { kind: "string", enum: ["start", "end"] } },
  })),
  object({ mode: { schema: { kind: "literal", value: "stretch" } } }),
] };
const stops = { kind: "array", minItems: 2, items: object({ offset: { schema: unsigned }, color: { schema: string } }) } as const;
const paint: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "solid" } }, color: { schema: string } }),
  object({ kind: { schema: { kind: "literal", value: "linear-gradient" } }, angleDeg: { schema: number }, stops: { schema: stops } }),
  object({ kind: { schema: { kind: "literal", value: "radial-gradient" } }, center: { schema: object({ x: { schema: unsigned }, y: { schema: unsigned } }) }, stops: { schema: stops } }),
] };
const appearance = object({
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
const samplingMotion = object({ keyframes: { schema: { kind: "array", minItems: 2, items: samplingKeyframe } } });
export const mediaPaintLayerSpecSchema: ValueSchema = object({

  id: { schema: string }, paint: { schema: paint }, opacity: { schema: unsigned },
});
export const mediaSampleLayerSpecSchema: ValueSchema = object({

  id: { schema: string }, trim: { schema: trim, optional: true }, occupancy: { schema: occupancy, optional: true },
  appearance: { schema: appearance }, samplingMotion: { schema: samplingMotion, optional: true },
});
const audioSource = object({ artifact: { schema: blob }, sampleFrames: { schema: positiveInteger } });
const visualSource: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "still" } }, artifact: { schema: blob }, extent: { schema: extent } }),
  object({
    kind: { schema: { kind: "literal", value: "timed" } }, artifact: { schema: blob }, extent: { schema: extent },
    frameRate: { schema: rational }, frameCount: { schema: positiveInteger }, audio: { schema: audioSource, optional: true },
  }),
  object({ kind: { schema: { kind: "literal", value: "surface" } }, surface: { schema: compositableSurfaceSchema }, extent: { schema: extent } }),
] };
const paintLayer = object({ id: { schema: string }, kind: { schema: { kind: "literal", value: "paint" } }, paint: { schema: paint }, opacity: { schema: unsigned } });
const sampleLayer = object({
  id: { schema: string }, kind: { schema: { kind: "literal", value: "sample" } }, source: { schema: visualSource },
  fit: { schema: contentFitSchema }, trim: { schema: trim, optional: true }, occupancy: { schema: occupancy, optional: true },
  appearance: { schema: appearance }, samplingMotion: { schema: samplingMotion, optional: true },
});
const layer = { kind: "oneOf", variants: [paintLayer, sampleLayer] } as const;
export const mediaLayerSetSchema: ValueSchema = object({

  layers: { schema: { kind: "array", items: layer } },
});

const path = { kind: "object", fields: {}, allowUnknown: true } as const;
const clip: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "none" } } }),
  object({ kind: { schema: { kind: "literal", value: "frame" } } }),
  object({ kind: { schema: { kind: "literal", value: "rounded" } }, radiusPx: { schema: unsigned } }),
  object({ kind: { schema: { kind: "literal", value: "path" } }, path: { schema: path } }),
] };
const padding = object({ topPx: { schema: unsigned }, rightPx: { schema: unsigned }, bottomPx: { schema: unsigned }, leftPx: { schema: unsigned } });
export const mediaFramePresentationSchema: ValueSchema = object({
  clip: { schema: clip }, padding: { schema: padding },
  border: { schema: object({ widthPx: { schema: unsigned }, style: { schema: { kind: "string", enum: ["solid", "dashed", "dotted"] } }, color: { schema: string } }), optional: true },
  shadows: { schema: { kind: "array", items: object({ offsetX: { schema: number }, offsetY: { schema: number }, blurPx: { schema: unsigned }, spreadPx: { schema: number }, color: { schema: string } }) } },
});
const edgeMotion = object({
  operator: { schema: { kind: "string", enum: ["fade", "slide", "scale", "pop", "bounce", "blur-reveal", "wipe", "flip", "spin"] } },
  durationFrames: { schema: positiveInteger }, easing: { schema: { kind: "string", enum: ["linear", "ease-in", "ease-out", "ease-in-out"] } },
  direction: { schema: { kind: "string", enum: ["left", "right", "up", "down"] }, optional: true }, amount: { schema: number, optional: true },
  origin: { schema: { kind: "literal", value: "outside-canvas" }, optional: true },
});
const sustainMotion = object({
  operator: { schema: { kind: "string", enum: ["float", "breathe", "pulse", "wobble", "shake", "drift"] } },
  amount: { schema: unsigned }, cycles: { schema: positiveInteger },
  direction: { schema: { kind: "string", enum: ["left", "right", "up", "down"] }, optional: true },
});
export const mediaLifecycleMotionSchema: ValueSchema = object({
  enter: { schema: edgeMotion, optional: true }, sustain: { schema: { kind: "array", items: sustainMotion } },
  exit: { schema: edgeMotion, optional: true },
});
const soundTrigger: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "enter" } } }),
  object({ kind: { schema: { kind: "literal", value: "exit" } } }),
  object({ kind: { schema: { kind: "literal", value: "handoff" } }, handoffId: { schema: string } }),
] };
export const mediaSoundSpecSchema: ValueSchema = object({

  id: { schema: string }, trigger: { schema: soundTrigger }, gain: { schema: unsigned },
});
const soundEvent = object({ id: { schema: string }, trigger: { schema: soundTrigger }, source: { schema: audioSource }, gain: { schema: unsigned } });
export const mediaSoundSetSchema: ValueSchema = object({

  sounds: { schema: { kind: "array", items: soundEvent } },
});
export const mediaItemSpecSchema: ValueSchema = object({
  id: { schema: string },
  presentation: { schema: mediaFramePresentationSchema }, motion: { schema: mediaLifecycleMotionSchema }, stackingOrder: { schema: integer },
  sourceAudio: { schema: object({ fromLayer: { schema: string }, gain: { schema: unsigned } }), optional: true },
});
const sourceAudio = object({ fromLayer: { schema: string }, gain: { schema: unsigned } });
export const mediaSequenceMemberSpecSchema: ValueSchema = object({

  id: { schema: string },
  sourceAudio: { schema: sourceAudio, optional: true },
});
const unresolvedMember = object({
  id: { schema: string }, activationFrame: { schema: unsignedInteger },
  layers: { schema: { kind: "array", minItems: 1, items: layer } },
  sourceAudio: { schema: sourceAudio, optional: true },
});
export const mediaSequenceMemberSetSchema: ValueSchema = object({

  members: { schema: { kind: "array", items: unresolvedMember } },
});
const direction = { kind: "string", enum: ["left", "right", "up", "down"] } as const;
const handoffFields = {
  id: { schema: string }, fromMemberId: { schema: string }, toMemberId: { schema: string },
  operator: { schema: { kind: "string", enum: ["cut", "crossfade", "push", "wipe", "cover", "page-turn"] } },
  durationFrames: { schema: unsignedInteger }, boundaryRatio: { schema: unsigned },
  direction: { schema: direction, optional: true }, audio: { schema: { kind: "string", enum: ["cut", "crossfade"] } },
} as const;
export const mediaHandoffSpecSchema: ValueSchema = object({
  ...handoffFields,
});
export const mediaSequenceSpecSchema: ValueSchema = object({

  id: { schema: string }, presentation: { schema: mediaFramePresentationSchema },
  motion: { schema: mediaLifecycleMotionSchema }, stackingOrder: { schema: integer },
  handoffs: { schema: { kind: "array", minItems: 1, items: mediaHandoffSpecSchema } },
});
const frameSpan = object({ startFrame: { schema: unsignedInteger }, endFrameExclusive: { schema: positiveInteger } });
const resolvedItem = object({
  id: { schema: string }, span: { schema: frameSpan }, frame: { schema: spatialFrameSchema },
  presentation: { schema: mediaFramePresentationSchema }, layers: { schema: { kind: "array", minItems: 1, items: layer } }, motion: { schema: mediaLifecycleMotionSchema },
  stacking: { schema: object({ order: { schema: integer }, tieBreak: { schema: string } }) },
  sourceAudio: { schema: object({ fromLayer: { schema: string }, gain: { schema: unsigned } }), optional: true },
  sounds: { schema: { kind: "array", items: soundEvent } },
});
const resolvedMember = object({
  id: { schema: string }, activationFrame: { schema: unsignedInteger }, logicalSpan: { schema: frameSpan },
  visualSpan: { schema: frameSpan }, layers: { schema: { kind: "array", minItems: 1, items: layer } },
  sourceAudio: { schema: sourceAudio, optional: true },
});
const resolvedHandoff = object({ ...handoffFields, span: { schema: frameSpan } });
const resolvedSequence = object({
  id: { schema: string }, span: { schema: frameSpan }, terminalFrame: { schema: positiveInteger },
  frame: { schema: spatialFrameSchema }, presentation: { schema: mediaFramePresentationSchema },
  members: { schema: { kind: "array", minItems: 2, items: resolvedMember } },
  handoffs: { schema: { kind: "array", minItems: 1, items: resolvedHandoff } },
  motion: { schema: mediaLifecycleMotionSchema }, stacking: { schema: object({ order: { schema: integer }, tieBreak: { schema: string } }) },
  sounds: { schema: { kind: "array", items: soundEvent } },
});
export const mediaTrackSetSchema: ValueSchema = object({
  items: { schema: { kind: "array", items: resolvedItem } },
  sequences: { schema: { kind: "array", items: resolvedSequence } },
});
export const mediaTrackProgramSchema: ValueSchema = object({
  id: { schema: string },
  items: { schema: { kind: "array", items: resolvedItem } }, sequences: { schema: { kind: "array", items: resolvedSequence } },
});
export const mediaTrackHeaderSchema: ValueSchema = object({
  id: { schema: string },
});

const itemInputs = [
  { name: "set", type: mediaTrackTypes.set }, { name: "header", type: mediaTrackTypes.header },
  { name: "space", type: programSpaceTypes.programSpace }, { name: "canvas", type: spatialTypes.canvas },
  { name: "layers", type: mediaTrackTypes.layerSet },
  { name: "frame", type: spatialTypes.frame }, { name: "spec", type: mediaTrackTypes.itemSpec },
  { name: "sounds", type: mediaTrackTypes.soundSet }, { name: "window", type: temporalTypes.window },
] as const;
const memberInputs = [
  { name: "members", type: mediaTrackTypes.memberSet }, { name: "space", type: programSpaceTypes.programSpace }, { name: "layers", type: mediaTrackTypes.layerSet },
  { name: "spec", type: mediaTrackTypes.memberSpec }, { name: "activation", type: temporalTypes.instant },
] as const;
const sequenceInputs = [
  { name: "set", type: mediaTrackTypes.set }, { name: "header", type: mediaTrackTypes.header },
  { name: "space", type: programSpaceTypes.programSpace }, { name: "canvas", type: spatialTypes.canvas },
  { name: "members", type: mediaTrackTypes.memberSet },
  { name: "frame", type: spatialTypes.frame }, { name: "spec", type: mediaTrackTypes.sequenceSpec },
  { name: "sounds", type: mediaTrackTypes.soundSet }, { name: "terminal", type: temporalTypes.instant },
] as const;

const appearanceRecipeProperties = [
  { name: "fit", required: false, fallback: "contain",
    values: ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"],
    summary: "Decides how the source is scaled into the Frame." },
  { name: "frame-x", required: false, fallback: "0.5",
    summary: "Places the anchor point across the Frame, from 0 at its left edge to 1 at its right." },
  { name: "frame-y", required: false, fallback: "0.5",
    summary: "Places the anchor point down the Frame, from 0 at its top edge to 1 at its bottom." },
  { name: "content-x", required: false, fallback: "0.5",
    summary: "Places the anchor point across the scaled source, from 0 at its left edge to 1 at its right." },
  { name: "content-y", required: false, fallback: "0.5",
    summary: "Places the anchor point down the scaled source, from 0 at its top edge to 1 at its bottom." },
  { name: "fit-offset-x", required: false, fallback: "0",
    summary: "Shifts the fitted source horizontally in pixels once the two anchor points meet." },
  { name: "fit-offset-y", required: false, fallback: "0",
    summary: "Shifts the fitted source vertically in pixels once the two anchor points meet." },
  { name: "fit-constraint", required: false, values: ["bounded", "free"], fallback: "bounded",
    summary: "Decides whether the fitted source is held inside the Frame or may overflow it." },
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
  { name: "playback", required: false, fallback: "once-start",
    values: ["once-start", "once-end", "hold-start", "hold-end", "loop-start", "loop-end", "stretch"],
    summary: "Decides how timed material occupies a window it does not match and which edge it aligns to." },
  { name: "trim-start", required: false,
    summary: "Starts timed material at this whole frame of its own timeline, and is written with `trim-end`." },
  { name: "trim-end", required: false,
    summary: "Ends timed material before this whole frame of its own timeline, and is written with `trim-start`." },
  { name: "stack-order", required: true,
    summary: "Orders this unit against every other Item and Sequence on the Track, higher drawing in front." },
  { name: "clip", required: false, values: ["none", "frame", "rounded"], fallback: "frame",
    summary: "Decides how the picture is clipped to the Frame." },
  { name: "radius", required: false, fallback: "0",
    summary: "Rounds the clipped corners by a pixel radius, and is read only for a `rounded` clip." },
  { name: "padding", required: false, fallback: "0",
    summary: "Insets the picture from the Frame edges. It admits one, two or four values — all sides, then vertical and horizontal, then each side — which no single number can carry, so it is written as text: `padding: \"14\"` and `padding: \"8 12\"`. A bare number is refused." },
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

const motionRecipeProperties = [
  { name: "enter", required: false, fallback: "none",
    values: ["none", "fade", "slide", "scale", "pop", "bounce", "blur-reveal", "wipe", "flip", "spin"],
    summary: "Chooses the operator the unit enters on." },
  { name: "enter-frames", required: false,
    summary: "Sets how many frames the entrance runs, which every entrance operator requires." },
  { name: "enter-easing", required: false, values: ["linear", "ease-in", "ease-out", "ease-in-out"], fallback: "ease-in-out",
    summary: "Shapes how the entrance accelerates." },
  { name: "enter-direction", required: false, values: ["left", "right", "up", "down"],
    summary: "Points a directional entrance the way it travels." },
  { name: "enter-amount", required: false,
    summary: "Sets how far the entrance operator displaces the unit." },
  { name: "enter-origin", required: false, values: ["outside-canvas"],
    summary: "Starts the entrance beyond the Canvas rather than at the Frame." },
  { name: "sustain", required: false, fallback: "none",
    summary: "Holds the unit in continuous motion for its whole window, written as `operator amount cycles` entries, each taking an optional direction, separated by commas." },
  { name: "exit", required: false, fallback: "none",
    values: ["none", "fade", "slide", "scale", "pop", "bounce", "blur-reveal", "wipe", "flip", "spin"],
    summary: "Chooses the operator the unit leaves on." },
  { name: "exit-frames", required: false,
    summary: "Sets how many frames the exit runs, which every exit operator requires." },
  { name: "exit-easing", required: false, values: ["linear", "ease-in", "ease-out", "ease-in-out"], fallback: "ease-in-out",
    summary: "Shapes how the exit accelerates." },
  { name: "exit-direction", required: false, values: ["left", "right", "up", "down"],
    summary: "Points a directional exit the way it travels." },
  { name: "exit-amount", required: false,
    summary: "Sets how far the exit operator displaces the unit." },
  { name: "exit-origin", required: false, values: ["outside-canvas"],
    summary: "Sends the exit beyond the Canvas rather than to the Frame." },
] as const;

export const mediaTrackMarkupSurfaces = [{
    name: "track", tag: "Track", mode: "structured",
    outputs: [spatialTypes.fit, mediaTrackTypes.header, mediaTrackTypes.paintLayerSpec, mediaTrackTypes.sampleLayerSpec,
      mediaTrackTypes.layerSet, mediaTrackTypes.soundSpec, mediaTrackTypes.soundSet,
      mediaTrackTypes.itemSpec, mediaTrackTypes.memberSpec, mediaTrackTypes.memberSet,
      mediaTrackTypes.handoffSpec, mediaTrackTypes.sequenceSpec, mediaTrackTypes.set,
      temporalTypes.instantSpec, temporalTypes.windowSpec, temporalTypes.instant, temporalTypes.window, mediaTrackTypes.program,
      compositionTypes.visualTrack, compositionTypes.audioTrack],
    vocabulary: {
      summary: "One Media Track: independently timed Items and replacement Sequences placed on a shared SemanticTrack and Canvas, lowered to one peer VisualTrack and, when audio is authored, one peer AudioTrack.",
      appearance: "Rectangular pictures, each filling its own Frame exactly where that Frame sits on the Canvas, and nothing besides: the Track draws no chrome, caption or backdrop of its own, and lays nothing out relative to anything else. Inside one Frame the layers stack back to front in the order they are written — flat or gradient Paint fills, then a still image, a video or a Surface scaled in by the fit — clipped to the Frame as a square, a rounded rectangle or an authored Path, optionally ringed by a border and sitting on drop shadows. An Item appears for its own window and leaves at the end of it, entering and exiting on one operator such as a fade, a slide from an edge, a scale, a pop or a wipe, holding a small continuous float, pulse or drift while it is up, and panning, zooming or rotating its picture inside the Frame across the window. A Sequence instead keeps one Frame occupied without a break and replaces the picture inside it at each activation point, the outgoing picture giving way on a cut, a crossfade, a push, a wipe, a cover or a page-turn; where two units overlap, the higher stack order draws in front.",
      preview: previewImage("Track.png"),
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this Track and prefixes the identity of every Item, Sequence, layer and sound that does not name itself." },
        { name: "semantic", kind: "reference", required: true, accepts: [semanticTrackTypes.track],
          summary: "Selects the continuous SemanticTrack that fixes the frame domain and every semantic anchor." },
        { name: "canvas", kind: "reference", required: true, accepts: [spatialTypes.canvas],
          summary: "Chooses the Canvas every Frame on this Track is measured inside." },
      ],
      children: [
        { tag: "Item", cardinality: "many",
          summary: "One independently timed picture on its own Frame, from a direct source or ordered Paint and Layer children, carrying its own Sampling and Sound children.",
          attributes: [
            { name: "id", kind: "identifier", required: false,
              summary: "Names this Item; the Track derives `<track>.item.<index>` when it is absent." },
            { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame],
              summary: "Chooses the Frame the Item occupies on the Canvas." },
            { name: "appearance", kind: "reference", required: true, accepts: [svsRecipeType],
              summary: "Chooses the Recipe for fitting, source occupancy, frame Paint, clipping, borders and shadows, and the Recipe every sample Layer falls back to.",
              recipe: appearanceRecipeProperties },
            { name: "motion", kind: "reference", required: false, accepts: [svsRecipeType],
              summary: "Chooses the Recipe for the whole Item's enter, sustain and exit motion.",
              recipe: motionRecipeProperties },
            { name: "clip", kind: "reference", required: false, accepts: [spatialTypes.path],
              summary: "Clips the Item to an authored Path." },
            { name: "image", kind: "reference", required: false, accepts: [artifactTypes.blob],
              summary: "Shows a durationless still image as the Item's direct source." },
            { name: "media", kind: "reference", required: false, accepts: [mediaTypes.synchronized],
              summary: "Shows an explicitly prepared timed source." },
            { name: "surface", kind: "reference", required: false, accepts: [mediaTypes.compositableSurface],
              summary: "Shows an alpha-aware still or timed Surface." },
            { name: "extent", kind: "reference", required: false, accepts: [spatialTypes.extent],
              summary: "Gives the still image its authored pixel Extent. The `fit` scales this Extent into the Frame, so what it decides is the shape: its width-to-height ratio has to be the picture's, and the pixel numbers themselves only have to hold that ratio. A generated picture's own size is the generator's to choose and is not knowable when the Source is written, so write the ratio you asked that generator for." },
            { name: "source-audio", kind: "literal", required: false,
              summary: "Names the layer whose source audio this Item emits." },
            { name: "audio-gain", kind: "literal", required: false,
              summary: "Scales the selected source audio by a linear gain; defaults to `1`." },
            ...temporalWindowAttributeVocabulary,
          ] },
        { tag: "Sequence", cardinality: "many",
          summary: "One Frame whose Members replace each other at explicit activation points, written as ordered Member, Handoff and Sound children.",
          attributes: [
            { name: "id", kind: "identifier", required: false,
              summary: "Names this Sequence; the Track derives `<track>.sequence.<index>` when it is absent." },
            { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame],
              summary: "Chooses the Frame every Member occupies." },
            { name: "appearance", kind: "reference", required: true, accepts: [svsRecipeType],
              summary: "Chooses the Recipe for fitting, frame Paint, clipping, borders and shadows, and the Recipe every Member falls back to.",
              recipe: appearanceRecipeProperties },
            { name: "motion", kind: "reference", required: false, accepts: [svsRecipeType],
              summary: "Chooses the Recipe for the whole Sequence's enter, sustain and exit motion.",
              recipe: motionRecipeProperties },
            { name: "clip", kind: "reference", required: false, accepts: [spatialTypes.path],
              summary: "Clips the Sequence to an authored Path." },
            { name: "until", kind: "expression", required: true, values: ["program.end"],
              accepts: [narrativeTypes.moment, narrativeTypes.selection],
              summary: "Ends the Sequence at the literal `program.end`, at a Moment, or at a Selection." },
            { name: "until-boundary", kind: "literal", required: false, values: ["start", "end"],
              summary: "Chooses which edge of the ending Selection ends the Sequence; defaults to `end`." },
          ] },
      ],
      ports: [
        { name: "program", type: mediaTrackTypes.program,
          summary: "The resolved Item and Sequence schedule consumed by both rendered facets." },
        { name: "visual", type: compositionTypes.visualTrack,
          summary: "The rendered picture, an ordinary peer VisualTrack." },
        { name: "audio", type: compositionTypes.audioTrack,
          summary: "The rendered sound, published only when a source audio selection or a Sound is authored." },
      ],
      example: `<pipeline:Normalize id="cutaway-bags" source={bags-take.video}
  video="primary-moving" audio="none" span-authority="video" clock={clock}/>

<media-track:Track id="cutaways" semantic={speech.semantic} canvas={vertical}>
  <media-track:Item id="bags" media={cutaway-bags.media} during={story.selection.bags}
    frame={full} appearance={recipes.media.cutaway} motion={recipes.motion.cut}/>
</media-track:Track>`,
      notes: [
        "A Track requires at least one Item or Sequence and accepts no text content.",
        "An Item states exactly one window form: `during`, `at` with `for`, `until` with `for`, or `start` with `end`; `selection`, `segment` and `moment` bind a start/end window and cannot be written together.",
        "A point expression is `program.start`, `program.end`, `selection.start`, `selection.end`, `segment.start`, `segment.end` or `moment.cue`, each optionally offset by `+` or `-` and a duration, or a bare duration read as an absolute position.",
        "A unit that names a direct source names exactly one of `image`, `media` or `surface`; `extent` is required with `image` and refused otherwise.",
        "`audio-gain` is refused without selected source audio.",
        "`clip` is refused on an Item or Sequence whose Recipe already states a clip.",
        "An `appearance` or `motion` Recipe is refused when it carries a property outside its own set.",
        "`playback`, `trim-start` and `trim-end` are refused on durationless still material, and `trim-start` and `trim-end` are written together or not at all.",
        "An `enter` or an `exit` operator requires its own `enter-frames` or `exit-frames`.",
        "An Item written with a direct source accepts `<Sampling>` and `<Sound>` children; an Item written without one accepts `<Paint>`, `<Layer>` and `<Sound>` children, and requires at least one Paint or Layer.",
        "A Sequence requires at least two `<Member>` children, exactly one `<Handoff>` for every adjacent Member pair, and accepts `<Sound>` children.",
        "`until-boundary` is refused for `program.end` and for a Moment.",
        "A Member is one picture in the replacement order:",
        [
          "| Attribute | Kind | Required | Meaning |",
          "|---|---|---|---|",
          "| `id` | identifier | no | Names this Member; the Sequence derives `<sequence>.member.<index>` otherwise |",
          "| `at` | reference (@hypit/narrative@1#NarrativeMoment, @hypit/narrative@1#NarrativeSelection) | yes | The Moment or Selection that activates this Member |",
          "| `boundary` | literal (start, end) | with a Selection | Which edge of the activating Selection the Member starts on; refused for a Moment |",
          "| `appearance` | reference (@hypit/svs@1#Recipe) | no | This Member's own Recipe in place of the Sequence's |",
          "| `image` | reference (@hypit/artifact@1#Blob) | one source form | A durationless still image, which also requires `extent` |",
          "| `media` | reference (@hypit/media@1#SynchronizedMedia) | one source form | An explicitly prepared timed source |",
          "| `surface` | reference (@hypit/media@1#CompositableSurfaceRef) | one source form | An alpha-aware still or timed Surface |",
          "| `extent` | reference (@hypit/spatial@1#IntrinsicExtent) | with `image` | The authored pixel extent of the still image |",
          "| `source-audio` | literal | no | Names the layer whose source audio this Member emits |",
          "| `audio-gain` | literal | with selected source audio | Linear gain applied to the selected source audio; defaults to `1` |",
        ].join("\n"),
        "A Member written with a direct source accepts `<Sampling>` children; a Member written without one accepts `<Paint>` and `<Layer>` children, and requires at least one of them.",
        "A Member `appearance` Recipe accepts the same properties as its Sequence's, of which the fit properties, the sample properties and `frame-paint` are read; clipping, padding, borders, shadows and `stack-order` stay with the Sequence Recipe.",
        "A Handoff is written empty and carries the transition between one Member pair:",
        [
          "| Attribute | Kind | Required | Meaning |",
          "|---|---|---|---|",
          "| `id` | identifier | no | Names this Handoff; the Sequence derives `<sequence>.handoff.<index>` otherwise |",
          "| `from` | literal | yes | The id of the outgoing Member, which must be the Member preceding this Handoff |",
          "| `transition` | reference (@hypit/svs@1#Recipe) | yes | The Recipe for the handoff operator, its length, its boundary and its audio treatment |",
        ].join("\n"),
        "A `transition` Recipe carries exactly these properties:",
        [
          "| Property | Required | Default | Meaning |",
          "|---|---|---|---|",
          "| `operator` | yes | — | How the outgoing Member gives way to the incoming one. One of cut, crossfade, push, wipe, cover, page-turn. |",
          "| `duration-frames` | yes | — | How many frames the handoff runs. |",
          "| `boundary-ratio` | no | `0.5` | Where the activation point sits inside the handoff, from 0 at its first frame to 1 at its last. |",
          "| `direction` | no | — | Points a directional handoff the way it travels. One of left, right, up, down. |",
          "| `audio` | no | `cut` | Decides whether source audio cuts or crossfades across the handoff. One of cut, crossfade. |",
        ].join("\n"),
        "A Paint child is written empty and paints one layer:",
        [
          "| Attribute | Kind | Required | Meaning |",
          "|---|---|---|---|",
          "| `id` | identifier | no | Names this layer; the Track derives one from the unit and the layer position otherwise |",
          "| `appearance` | reference (@hypit/svs@1#Recipe) | yes | The solid or gradient paint and the opacity this layer is filled with |",
        ].join("\n"),
        "A Paint `appearance` Recipe carries exactly these properties:",
        [
          "| Property | Required | Default | Meaning |",
          "|---|---|---|---|",
          "| `paint` | yes | — | Fills the layer with a color, `linear(angle;stops)` or `radial(x,y;stops)`, each gradient carrying at least two `color@offset` stops. |",
          "| `opacity` | no | `1` | Sets how opaque the fill is drawn. |",
        ].join("\n"),
        "A Layer child samples one source into the unit's Frame:",
        [
          "| Attribute | Kind | Required | Meaning |",
          "|---|---|---|---|",
          "| `id` | identifier | no | Names this layer, which `source-audio` selects by; the Track derives one from the unit and the layer position otherwise |",
          "| `image` | reference (@hypit/artifact@1#Blob) | one source form | A durationless still image, which also requires `extent` |",
          "| `media` | reference (@hypit/media@1#SynchronizedMedia) | one source form | An explicitly prepared timed source |",
          "| `surface` | reference (@hypit/media@1#CompositableSurfaceRef) | one source form | An alpha-aware still or timed Surface |",
          "| `extent` | reference (@hypit/spatial@1#IntrinsicExtent) | with `image` | The authored pixel extent of the still image |",
          "| `appearance` | reference (@hypit/svs@1#Recipe) | no | This layer's own Recipe in place of the unit's |",
        ].join("\n"),
        "A Layer `appearance` Recipe carries the fit properties and the sample properties and nothing else, so a Layer states its own Recipe rather than inheriting the unit's, which requires `stack-order`.",
        "A Sampling child is written empty and states one keyframe of sampling motion:",
        [
          "| Attribute | Kind | Required | Meaning |",
          "|---|---|---|---|",
          "| `at` | literal | yes | Where the keyframe sits in the unit's window, written as `start`, `end` or a percentage inside `0%`..`100%` |",
          "| `zoom` | literal | no | The sampling scale at this keyframe; defaults to `1` |",
          "| `x` | literal | no | The horizontal sampling offset at this keyframe; defaults to `0` |",
          "| `y` | literal | no | The vertical sampling offset at this keyframe; defaults to `0` |",
          "| `rotate` | literal | no | The sampling rotation in degrees at this keyframe; defaults to `0` |",
          "| `easing` | literal (linear, ease-in, ease-out, ease-in-out) | no | How the sampling moves out of this keyframe |",
        ].join("\n"),
        "A Sound child is written empty and plays one prepared source on one trigger:",
        [
          "| Attribute | Kind | Required | Meaning |",
          "|---|---|---|---|",
          "| `id` | identifier | no | Names this sound; the Track derives one from the unit and the sound position otherwise |",
          "| `source` | reference (@hypit/media@1#SynchronizedMedia) | yes | The explicitly prepared audio this sound plays |",
          "| `at` | literal (enter, exit) | one trigger form | Plays the sound as the unit enters or as it exits |",
          "| `handoff` | literal | one trigger form | Plays the sound on the named Handoff of the surrounding Sequence |",
          "| `gain` | literal | no | Linear gain applied to this sound; defaults to `1` |",
        ].join("\n"),
        "A Sound states exactly one trigger form, and `handoff` only names a Handoff of the Sequence it is written in.",
        "A direct source is sampled into a layer named `content`, so `audio=\"include\"` on a direct video selects that audio itself and refuses `source-audio` beside it.",
      ],
    },
  }] as const;


export const mediaTrackManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: mediaTrackModuleRef.name,
  version: mediaTrackModuleRef.version,
  dependencies: [
    artifactDependency,
    mediaDependency,
    narrativeDependency,
    programSpaceDependency,
    semanticTrackDependency,
    temporalDependency,
    spatialDependency,
    compositionDependency,
  ],
  types: [
    { name: mediaTrackTypes.header.name },
    { name: mediaTrackTypes.paintLayerSpec.name },
    { name: mediaTrackTypes.sampleLayerSpec.name },
    { name: mediaTrackTypes.layerSet.name },
    { name: mediaTrackTypes.soundSpec.name },
    { name: mediaTrackTypes.soundSet.name },
    { name: mediaTrackTypes.itemSpec.name },
    { name: mediaTrackTypes.memberSpec.name },
    { name: mediaTrackTypes.memberSet.name },
    { name: mediaTrackTypes.handoffSpec.name },
    { name: mediaTrackTypes.sequenceSpec.name },
    { name: mediaTrackTypes.set.name },
    { name: mediaTrackTypes.program.name },
  ],
  capabilities: [],
  producers: [
    { name: mediaTrackProducers.createLayers.name, inputs: [], outputs: [{ name: "layers", type: mediaTrackTypes.layerSet }], needs: [] },
    { name: mediaTrackProducers.appendPaintLayer.name, inputs: [{ name: "layers", type: mediaTrackTypes.layerSet }, { name: "spec", type: mediaTrackTypes.paintLayerSpec }], outputs: [{ name: "layers", type: mediaTrackTypes.layerSet }], needs: [] },
    { name: mediaTrackProducers.appendStillLayer.name, inputs: [{ name: "layers", type: mediaTrackTypes.layerSet }, { name: "source", type: artifactTypes.blob }, { name: "extent", type: spatialTypes.extent }, { name: "fit", type: spatialTypes.fit }, { name: "spec", type: mediaTrackTypes.sampleLayerSpec }], outputs: [{ name: "layers", type: mediaTrackTypes.layerSet }], needs: [] },
    { name: mediaTrackProducers.appendTimedLayer.name, inputs: [{ name: "layers", type: mediaTrackTypes.layerSet }, { name: "source", type: mediaTypes.synchronized }, { name: "fit", type: spatialTypes.fit }, { name: "spec", type: mediaTrackTypes.sampleLayerSpec }], outputs: [{ name: "layers", type: mediaTrackTypes.layerSet }], needs: [] },
    { name: mediaTrackProducers.appendSurfaceLayer.name, inputs: [{ name: "layers", type: mediaTrackTypes.layerSet }, { name: "source", type: mediaTypes.compositableSurface }, { name: "fit", type: spatialTypes.fit }, { name: "spec", type: mediaTrackTypes.sampleLayerSpec }], outputs: [{ name: "layers", type: mediaTrackTypes.layerSet }], needs: [] },
    { name: mediaTrackProducers.createSounds.name, inputs: [], outputs: [{ name: "sounds", type: mediaTrackTypes.soundSet }], needs: [] },
    { name: mediaTrackProducers.appendSound.name, inputs: [{ name: "sounds", type: mediaTrackTypes.soundSet }, { name: "source", type: mediaTypes.synchronized }, { name: "spec", type: mediaTrackTypes.soundSpec }], outputs: [{ name: "sounds", type: mediaTrackTypes.soundSet }], needs: [] },
    { name: mediaTrackProducers.createSet.name, inputs: [], outputs: [{ name: "set", type: mediaTrackTypes.set }], needs: [] },
    { name: mediaTrackProducers.appendItem.name, inputs: itemInputs, outputs: [{ name: "set", type: mediaTrackTypes.set }], needs: [] },
    { name: mediaTrackProducers.bindItemClipPath.name, inputs: [{ name: "spec", type: mediaTrackTypes.itemSpec }, { name: "path", type: spatialTypes.path }], outputs: [{ name: "spec", type: mediaTrackTypes.itemSpec }], needs: [] },
    { name: mediaTrackProducers.bindSequenceClipPath.name, inputs: [{ name: "spec", type: mediaTrackTypes.sequenceSpec }, { name: "path", type: spatialTypes.path }], outputs: [{ name: "spec", type: mediaTrackTypes.sequenceSpec }], needs: [] },
    { name: mediaTrackProducers.createMembers.name, inputs: [], outputs: [{ name: "members", type: mediaTrackTypes.memberSet }], needs: [] },
    { name: mediaTrackProducers.appendMember.name, inputs: memberInputs, outputs: [{ name: "members", type: mediaTrackTypes.memberSet }], needs: [] },
    { name: mediaTrackProducers.appendSequence.name, inputs: sequenceInputs, outputs: [{ name: "set", type: mediaTrackTypes.set }], needs: [] },
    { name: mediaTrackProducers.finalize.name, inputs: [{ name: "set", type: mediaTrackTypes.set }, { name: "header", type: mediaTrackTypes.header }, { name: "space", type: programSpaceTypes.programSpace }], outputs: [{ name: "program", type: mediaTrackTypes.program }], needs: [] },
    { name: mediaTrackProducers.projectVisual.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: mediaTrackTypes.program }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
    { name: mediaTrackProducers.projectAudio.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: mediaTrackTypes.program }], outputs: [{ name: "track", type: compositionTypes.audioTrack }], needs: [] },
  ],
};

export const mediaTrackDependency = { module: mediaTrackModuleRef } as const;
