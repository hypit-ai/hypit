import type { ProducerPackage, ProducerHandlerContext } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { CompositableSurfaceRef, SynchronizedMedia } from "@hypit/media";
import { assertBlobRef, canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, Value } from "@hypit/hypit/protocol";
import type { ContentFit, IntrinsicExtent, SpatialFrame, SpatialMap2D, SpatialPath } from "@hypit/spatial";
import type { TemporalWindow } from "@hypit/temporal";
import type { Timeline } from "@hypit/timeline";

import {
  appendMediaPaintLayer,
  appendMappedStillMediaLayer,
  appendMappedSurfaceMediaLayer,
  appendMappedTimedMediaLayer,
  appendStillMediaLayer,
  appendSurfaceMediaLayer,
  appendTimedMediaLayer,
  assertMediaLayerSet,
  assertMediaPaintLayerSpec,
  assertMediaSampleLayerSpec,
  createMediaLayerSet,
} from "./layers.js";
import { visualTrackProducers, visualTrackTypes } from "./manifest.js";
import {
  appendVisualClip,
  assertVisualClipSpec,
  assertVisualTrackHeader,
  assertVisualTrackProgram,
  assertVisualTrackSet,
  bindVisualClipMotion,
  bindVisualClipPath,
  createVisualTrackSet,
  finalizeVisualTrack,
  projectVisualTrack,
} from "./program.js";
import { assertVisualClipMotion } from "./motion.js";
import { assertVisualSourceTimeSpec } from "./source-time.js";
import type {
  MediaLayerSet,
  MediaPaintLayerSpec,
  MediaSampleLayerSpec,
  VisualClipMotion,
  VisualClipSpec,
  VisualSourceTimeSpec,
  VisualTrackHeader,
  VisualTrackProgram,
  VisualTrackSet,
} from "./types.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

function blob(value: Value | undefined): BlobRef {
  assertBlobRef(value, "Visual source");
  return value;
}

const output = (value: unknown) => ((canonicalize(value)));

function clipInputs(inputs: ProducerHandlerContext["inputs"]) {
  return {
    set: valueOf<VisualTrackSet>(inputs.set?.value, "VisualTrackSet"),
    header: valueOf<VisualTrackHeader>(inputs.header?.value, "VisualTrackHeader"),
    timeline: valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
    layers: valueOf<MediaLayerSet>(inputs.layers?.value, "MediaLayerSet"),
    frame: valueOf<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
    spec: valueOf<VisualClipSpec>(inputs.spec?.value, "VisualClipSpec"),
    window: valueOf<TemporalWindow>(inputs.window?.value, "TemporalWindow"),
  };
}

export const visualTrackComponent = {
  producers: [
    { producer: visualTrackProducers.createLayers, handler: () => ({ kind: "output", value: output(createMediaLayerSet()) }) },
    { producer: visualTrackProducers.appendPaintLayer, handler: ({ inputs }) => ({ kind: "output", value: output(appendMediaPaintLayer(
      valueOf<MediaLayerSet>(inputs.layers?.value, "MediaLayerSet"),
      valueOf<MediaPaintLayerSpec>(inputs.spec?.value, "MediaPaintLayerSpec"),
    )) }) },
    { producer: visualTrackProducers.appendStillLayer, handler: ({ inputs }) => ({ kind: "output", value: output(appendStillMediaLayer(
      valueOf<MediaLayerSet>(inputs.layers?.value, "MediaLayerSet"), blob(inputs.source?.value),
      valueOf<IntrinsicExtent>(inputs.extent?.value, "IntrinsicExtent"), valueOf<ContentFit>(inputs.fit?.value, "ContentFit"),
      valueOf<MediaSampleLayerSpec>(inputs.spec?.value, "MediaSampleLayerSpec"),
    )) }) },
    { producer: visualTrackProducers.appendMappedStillLayer, handler: ({ inputs }) => ({ kind: "output", value: output(appendMappedStillMediaLayer(
      valueOf<MediaLayerSet>(inputs.layers?.value, "MediaLayerSet"), blob(inputs.source?.value),
      valueOf<IntrinsicExtent>(inputs.extent?.value, "IntrinsicExtent"), valueOf<SpatialMap2D>(inputs.mapping?.value, "SpatialMap2D"),
      valueOf<MediaSampleLayerSpec>(inputs.spec?.value, "MediaSampleLayerSpec"),
    )) }) },
    { producer: visualTrackProducers.appendTimedLayer, handler: ({ inputs }) => ({ kind: "output", value: output(appendTimedMediaLayer(
      valueOf<MediaLayerSet>(inputs.layers?.value, "MediaLayerSet"), valueOf<SynchronizedMedia>(inputs.source?.value, "SynchronizedMedia"),
      valueOf<ContentFit>(inputs.fit?.value, "ContentFit"), valueOf<MediaSampleLayerSpec>(inputs.spec?.value, "MediaSampleLayerSpec"),
    )) }) },
    { producer: visualTrackProducers.appendMappedTimedLayer, handler: ({ inputs }) => ({ kind: "output", value: output(appendMappedTimedMediaLayer(
      valueOf<MediaLayerSet>(inputs.layers?.value, "MediaLayerSet"), valueOf<SynchronizedMedia>(inputs.source?.value, "SynchronizedMedia"),
      valueOf<SpatialMap2D>(inputs.mapping?.value, "SpatialMap2D"), valueOf<MediaSampleLayerSpec>(inputs.spec?.value, "MediaSampleLayerSpec"),
    )) }) },
    { producer: visualTrackProducers.appendSurfaceLayer, handler: ({ inputs }) => ({ kind: "output", value: output(appendSurfaceMediaLayer(
      valueOf<MediaLayerSet>(inputs.layers?.value, "MediaLayerSet"), valueOf<CompositableSurfaceRef>(inputs.source?.value, "CompositableSurfaceRef"),
      valueOf<ContentFit>(inputs.fit?.value, "ContentFit"), valueOf<MediaSampleLayerSpec>(inputs.spec?.value, "MediaSampleLayerSpec"),
    )) }) },
    { producer: visualTrackProducers.appendMappedSurfaceLayer, handler: ({ inputs }) => ({ kind: "output", value: output(appendMappedSurfaceMediaLayer(
      valueOf<MediaLayerSet>(inputs.layers?.value, "MediaLayerSet"), valueOf<CompositableSurfaceRef>(inputs.source?.value, "CompositableSurfaceRef"),
      valueOf<SpatialMap2D>(inputs.mapping?.value, "SpatialMap2D"), valueOf<MediaSampleLayerSpec>(inputs.spec?.value, "MediaSampleLayerSpec"),
    )) }) },
    { producer: visualTrackProducers.createSet, handler: () => ({ kind: "output", value: output(createVisualTrackSet()) }) },
    { producer: visualTrackProducers.appendClip, handler: ({ inputs }) => {
      const value = clipInputs(inputs);
      return { kind: "output", value: output(appendVisualClip(
        value.set, value.header, value.timeline, value.layers, value.frame, value.spec, value.window,
      )) };
    } },
    { producer: visualTrackProducers.bindClipPath, handler: ({ inputs }) => ({ kind: "output", value: output(bindVisualClipPath(
      valueOf<VisualClipSpec>(inputs.spec?.value, "VisualClipSpec"), valueOf<SpatialPath>(inputs.path?.value, "SpatialPath"),
    )) }) },
    { producer: visualTrackProducers.bindMotion, handler: ({ inputs }) => ({ kind: "output", value: output(bindVisualClipMotion(
      valueOf<VisualClipSpec>(inputs.spec?.value, "VisualClipSpec"), valueOf<VisualClipMotion>(inputs.motion?.value, "VisualClipMotion"),
    )) }) },
    { producer: visualTrackProducers.finalize, handler: ({ inputs }) => ({ kind: "output", value: output(finalizeVisualTrack(
      valueOf<VisualTrackSet>(inputs.set?.value, "VisualTrackSet"), valueOf<VisualTrackHeader>(inputs.header?.value, "VisualTrackHeader"),
      valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
    )) }) },
    { producer: visualTrackProducers.projectVisual, handler: ({ inputs }) => ({ kind: "output", value: output(projectVisualTrack(
      valueOf<Timeline>(inputs.timeline?.value, "Timeline"), valueOf<VisualTrackProgram>(inputs.program?.value, "VisualTrackProgram"),
    )) }) },
  ],
  refinements: [
    { type: visualTrackTypes.header,
      handler: ({ value }) => assertVisualTrackHeader(valueOf<VisualTrackHeader>(value, "VisualTrackHeader")) },
    { type: visualTrackTypes.motion,
      handler: ({ value }) => assertVisualClipMotion(valueOf<VisualClipMotion>(value, "VisualClipMotion"), "VisualClipMotion") },
    { type: visualTrackTypes.sourceTime,
      handler: ({ value }) => assertVisualSourceTimeSpec(valueOf<VisualSourceTimeSpec>(value, "VisualSourceTimeSpec")) },
    { type: visualTrackTypes.paintLayerSpec,
      handler: ({ value }) => assertMediaPaintLayerSpec(valueOf<MediaPaintLayerSpec>(value, "MediaPaintLayerSpec")) },
    { type: visualTrackTypes.sampleLayerSpec,
      handler: ({ value }) => assertMediaSampleLayerSpec(valueOf<MediaSampleLayerSpec>(value, "MediaSampleLayerSpec")) },
    { type: visualTrackTypes.layerSet,
      handler: ({ value }) => assertMediaLayerSet(valueOf<MediaLayerSet>(value, "MediaLayerSet")) },
    { type: visualTrackTypes.clipSpec,
      handler: ({ value }) => assertVisualClipSpec(valueOf<VisualClipSpec>(value, "VisualClipSpec")) },
    { type: visualTrackTypes.set,
      handler: ({ value }) => assertVisualTrackSet(valueOf<VisualTrackSet>(value, "VisualTrackSet")) },
    { type: visualTrackTypes.program,
      handler: ({ value }) => assertVisualTrackProgram(valueOf<VisualTrackProgram>(value, "VisualTrackProgram")) },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
