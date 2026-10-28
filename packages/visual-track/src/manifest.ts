import { frameSpanSchema, timelineDependency, timelineTypes } from "@hypit/timeline";

import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import { compositionDependency, compositionTypes, visualProgramCarrierSchema } from "@hypit/composition";
import {
  compositableSurfaceSchema,
  mediaDependency,
  mediaTypes,
  preparedMediaSchema,
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
import { temporalDependency, temporalMapSchema, temporalRelationSpecSchema, temporalTypes } from "@hypit/temporal";

export const visualTrackModuleRef = { name: "@hypit/visual-track", version: "1" } as const;
export const visualTrackTypes = {
  header: { module: visualTrackModuleRef, name: "VisualTrackHeader" },
  motion: { module: visualTrackModuleRef, name: "VisualClipMotion" },
  paintLayerSpec: { module: visualTrackModuleRef, name: "MediaPaintLayerSpec" },
  sampleLayerSpec: { module: visualTrackModuleRef, name: "MediaSampleLayerSpec" },
  layerSet: { module: visualTrackModuleRef, name: "MediaLayerSet" },
  clipSpec: { module: visualTrackModuleRef, name: "VisualClipSpec" },
  transitionEffect: { module: visualTrackModuleRef, name: "VisualTransitionEffect" },
  transitionSpec: { module: visualTrackModuleRef, name: "VisualTransitionSpec" },
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
  appendTransition: { module: visualTrackModuleRef, name: "append-visual-transition" },
  bindClipPath: { module: visualTrackModuleRef, name: "bind-visual-clip-path" },
  bindMotion: { module: visualTrackModuleRef, name: "bind-visual-clip-motion" },
  finalize: { module: visualTrackModuleRef, name: "finalize-visual-track" },
  projectVisual: { module: visualTrackModuleRef, name: "project-visual-track" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const unsigned = { kind: "number", minimum: 0 } as const;
const unsignedInteger = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const blob = blobRefSchema();
const extent = intrinsicExtentSchema;
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

  id: { schema: string }, sampling: { schema: temporalRelationSpecSchema, optional: true },
  appearance: { schema: mediaSampleAppearanceSchema }, samplingMotion: { schema: mediaSamplingMotionSchema, optional: true },
});
const visualSource: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "still" } }, artifact: { schema: blob }, extent: { schema: extent } }),
  object({
    kind: { schema: { kind: "literal", value: "timed" } }, media: { schema: preparedMediaSchema }, extent: { schema: extent },
  }),
  object({ kind: { schema: { kind: "literal", value: "surface" } }, surface: { schema: compositableSurfaceSchema }, extent: { schema: extent } }),
] };
const paintLayer = object({ id: { schema: string }, kind: { schema: { kind: "literal", value: "paint" } }, paint: { schema: paint }, opacity: { schema: unsigned } });
const sampleLayer = object({
  id: { schema: string }, kind: { schema: { kind: "literal", value: "sample" } }, source: { schema: visualSource },
  sampling: { schema: { kind: "oneOf", variants: [
    object({ kind: { schema: { kind: "literal", value: "relation" } }, value: { schema: temporalRelationSpecSchema } }),
    object({ kind: { schema: { kind: "literal", value: "map" } }, value: { schema: temporalMapSchema } }),
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
  sampling: { schema: { kind: "oneOf", variants: [
    object({ kind: { schema: { kind: "literal", value: "relation" } }, value: { schema: temporalRelationSpecSchema } }),
    object({ kind: { schema: { kind: "literal", value: "map" } }, value: { schema: temporalMapSchema } }),
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
export const visualTransitionEffectSchema: ValueSchema = visualProgramCarrierSchema;
export const visualTransitionSpecSchema: ValueSchema = object({
  id: { schema: string },
  outgoingClipId: { schema: string },
  incomingClipId: { schema: string },
  effect: { schema: visualTransitionEffectSchema },
});
const resolvedClip = object({
  id: { schema: string }, subjectId: { schema: string }, span: { schema: frameSpanSchema }, frame: { schema: spatialFrameSchema },
  treatment: { schema: visualFrameTreatmentSchema }, layers: { schema: { kind: "array", minItems: 1, items: resolvedLayer } }, motion: { schema: visualClipMotionSchema, optional: true },
});
export const visualTrackSetSchema: ValueSchema = object({
  clips: { schema: { kind: "array", items: resolvedClip } },
  transitions: { schema: { kind: "array", items: visualTransitionSpecSchema } },
});
export const visualTrackProgramSchema: ValueSchema = object({
  id: { schema: string },
  clips: { schema: { kind: "array", items: resolvedClip } },
  transitions: { schema: { kind: "array", items: visualTransitionSpecSchema } },
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
    visualTrackTypes.paintLayerSpec.name,
    visualTrackTypes.sampleLayerSpec.name,
    visualTrackTypes.layerSet.name,
    visualTrackTypes.clipSpec.name,
    visualTrackTypes.transitionEffect.name,
    visualTrackTypes.transitionSpec.name,
    visualTrackTypes.set.name,
    visualTrackTypes.program.name,
  ],
  capabilities: [],
  producers: [
    { name: visualTrackProducers.createLayers.name, inputs: [], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.appendPaintLayer.name, inputs: [{ name: "layers", type: visualTrackTypes.layerSet }, { name: "spec", type: visualTrackTypes.paintLayerSpec }], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.appendStillLayer.name, inputs: [{ name: "layers", type: visualTrackTypes.layerSet }, { name: "source", type: blobTypes.blob }, { name: "extent", type: spatialTypes.extent }, { name: "fit", type: spatialTypes.fit }, { name: "spec", type: visualTrackTypes.sampleLayerSpec }], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.appendMappedStillLayer.name, inputs: [{ name: "layers", type: visualTrackTypes.layerSet }, { name: "source", type: blobTypes.blob }, { name: "extent", type: spatialTypes.extent }, { name: "mapping", type: spatialTypes.map2D }, { name: "spec", type: visualTrackTypes.sampleLayerSpec }], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.appendTimedLayer.name, inputs: [{ name: "layers", type: visualTrackTypes.layerSet }, { name: "media", type: mediaTypes.prepared }, { name: "fit", type: spatialTypes.fit }, { name: "spec", type: visualTrackTypes.sampleLayerSpec }], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.appendMappedTimedLayer.name, inputs: [{ name: "layers", type: visualTrackTypes.layerSet }, { name: "media", type: mediaTypes.prepared }, { name: "mapping", type: spatialTypes.map2D }, { name: "spec", type: visualTrackTypes.sampleLayerSpec }], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.appendSurfaceLayer.name, inputs: [{ name: "layers", type: visualTrackTypes.layerSet }, { name: "source", type: mediaTypes.compositableSurface }, { name: "fit", type: spatialTypes.fit }, { name: "spec", type: visualTrackTypes.sampleLayerSpec }], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.appendMappedSurfaceLayer.name, inputs: [{ name: "layers", type: visualTrackTypes.layerSet }, { name: "source", type: mediaTypes.compositableSurface }, { name: "mapping", type: spatialTypes.map2D }, { name: "spec", type: visualTrackTypes.sampleLayerSpec }], result: { kind: "output" as const, name: "layers", type: visualTrackTypes.layerSet } },
    { name: visualTrackProducers.createSet.name, inputs: [], result: { kind: "output" as const, name: "set", type: visualTrackTypes.set } },
    { name: visualTrackProducers.appendClip.name, inputs: clipInputs, result: { kind: "output" as const, name: "set", type: visualTrackTypes.set } },
    { name: visualTrackProducers.appendTransition.name, inputs: [
      { name: "set", type: visualTrackTypes.set }, { name: "spec", type: visualTrackTypes.transitionSpec },
    ], result: { kind: "output" as const, name: "set", type: visualTrackTypes.set } },
    { name: visualTrackProducers.bindClipPath.name, inputs: [{ name: "spec", type: visualTrackTypes.clipSpec }, { name: "path", type: spatialTypes.path }], result: { kind: "output" as const, name: "spec", type: visualTrackTypes.clipSpec } },
    { name: visualTrackProducers.bindMotion.name, inputs: [{ name: "spec", type: visualTrackTypes.clipSpec }, { name: "motion", type: visualTrackTypes.motion }], result: { kind: "output" as const, name: "spec", type: visualTrackTypes.clipSpec } },
    { name: visualTrackProducers.finalize.name, inputs: [{ name: "set", type: visualTrackTypes.set }, { name: "header", type: visualTrackTypes.header }, { name: "timeline", type: timelineTypes.timeline }], result: { kind: "output" as const, name: "program", type: visualTrackTypes.program } },
    { name: visualTrackProducers.projectVisual.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "program", type: visualTrackTypes.program }], result: { kind: "output" as const, name: "track", type: compositionTypes.visualTrack } },
  ],
};

export const visualTrackDependency = visualTrackModuleRef;
