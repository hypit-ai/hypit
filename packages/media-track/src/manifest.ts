import { artifactDependency, artifactTypes } from "@narratage/artifact";
import { compositionDependency, compositionTypes } from "@narratage/composition";
import {
  compositableSurfaceSchema,
  mediaDependency,
  mediaTypes,
} from "@narratage/media";
import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { mediaPipelineManifest, mediaPipelineModuleRef } from "@narratage/media-pipeline";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import { semanticMapDependency, semanticMapTypes } from "@narratage/semantic-map";
import {
  contentFitSchema,
  intrinsicExtentSchema,
  spatialDependency,
  spatialFrameSchema,
  spatialTypes,
} from "@narratage/spatial";
import { temporalDependency } from "@narratage/temporal";

export const mediaTrackModuleRef = { name: "@narratage/media-track", version: "1" } as const;
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
  appendProgramItem: { module: mediaTrackModuleRef, name: "append-program-media-item" },
  appendSelectionItem: { module: mediaTrackModuleRef, name: "append-selection-media-item" },
  appendSegmentItem: { module: mediaTrackModuleRef, name: "append-segment-media-item" },
  appendMomentItem: { module: mediaTrackModuleRef, name: "append-moment-media-item" },
  bindItemClipPath: { module: mediaTrackModuleRef, name: "bind-media-item-clip-path" },
  bindSequenceClipPath: { module: mediaTrackModuleRef, name: "bind-media-sequence-clip-path" },
  createMembers: { module: mediaTrackModuleRef, name: "create-media-sequence-member-set" },
  appendMomentMember: { module: mediaTrackModuleRef, name: "append-moment-media-sequence-member" },
  appendSelectionStartMember: { module: mediaTrackModuleRef, name: "append-selection-start-media-sequence-member" },
  appendSelectionEndMember: { module: mediaTrackModuleRef, name: "append-selection-end-media-sequence-member" },
  appendSequenceProgramEnd: { module: mediaTrackModuleRef, name: "append-media-sequence-until-program-end" },
  appendSequenceUntilMoment: { module: mediaTrackModuleRef, name: "append-media-sequence-until-moment" },
  appendSequenceUntilSelectionStart: { module: mediaTrackModuleRef, name: "append-media-sequence-until-selection-start" },
  appendSequenceUntilSelectionEnd: { module: mediaTrackModuleRef, name: "append-media-sequence-until-selection-end" },
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
  digest: { schema: { kind: "string", minLength: 71, maxLength: 71 } },
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

const duration: ValueSchema = { kind: "oneOf", variants: [
  object({ unit: { schema: { kind: "literal", value: "frames" } }, value: { schema: unsignedInteger } }),
  object({ unit: { schema: { kind: "literal", value: "milliseconds" } }, value: { schema: unsignedInteger } }),
  object({ unit: { schema: { kind: "literal", value: "seconds" } }, numerator: { schema: unsignedInteger }, denominator: { schema: positiveInteger } }),
] };
const signedDuration: ValueSchema = { kind: "oneOf", variants: [
  object({ unit: { schema: { kind: "literal", value: "frames" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "milliseconds" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "seconds" } }, numerator: { schema: integer }, denominator: { schema: positiveInteger } }),
] };
const point: ValueSchema = { kind: "oneOf", variants: [
  ...["program.start", "program.end", "selection.start", "selection.end", "segment.start", "segment.end", "moment.cue"].map((ref) => object({
    ref: { schema: { kind: "literal", value: ref } }, offset: { schema: signedDuration, optional: true },
  })),
  object({ ref: { schema: { kind: "literal", value: "absolute" } }, at: { schema: duration } }),
] };
const projection = object({ start: { schema: point }, end: { schema: point } });
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
  projection: { schema: projection }, expansion: { schema: object({ kind: { schema: { kind: "string", enum: ["one", "each"] } } }) },
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

const validator = (digest: ReturnType<typeof digestOf>) => ({
  implementation: { digest },
});
const itemInputs = [
  { name: "set", type: mediaTrackTypes.set }, { name: "header", type: mediaTrackTypes.header },
  { name: "space", type: programSpaceTypes.programSpace }, { name: "canvas", type: spatialTypes.canvas },
  { name: "layers", type: mediaTrackTypes.layerSet },
  { name: "frame", type: spatialTypes.frame }, { name: "spec", type: mediaTrackTypes.itemSpec },
  { name: "sounds", type: mediaTrackTypes.soundSet },
] as const;
const memberInputs = [
  { name: "members", type: mediaTrackTypes.memberSet }, { name: "layers", type: mediaTrackTypes.layerSet },
  { name: "spec", type: mediaTrackTypes.memberSpec }, { name: "map", type: semanticMapTypes.complete },
] as const;
const sequenceInputs = [
  { name: "set", type: mediaTrackTypes.set }, { name: "header", type: mediaTrackTypes.header },
  { name: "space", type: programSpaceTypes.programSpace }, { name: "canvas", type: spatialTypes.canvas },
  { name: "members", type: mediaTrackTypes.memberSet },
  { name: "frame", type: spatialTypes.frame }, { name: "spec", type: mediaTrackTypes.sequenceSpec },
  { name: "sounds", type: mediaTrackTypes.soundSet },
] as const;

export const mediaTrackMarkupSurfaces = [{
    name: "track", tag: "Track", mode: "structured",
    outputs: [spatialTypes.fit, mediaTrackTypes.header, mediaTrackTypes.paintLayerSpec, mediaTrackTypes.sampleLayerSpec,
      mediaTrackTypes.layerSet, mediaTrackTypes.soundSpec, mediaTrackTypes.soundSet,
      mediaTrackTypes.itemSpec, mediaTrackTypes.memberSpec, mediaTrackTypes.memberSet,
      mediaTrackTypes.handoffSpec, mediaTrackTypes.sequenceSpec, mediaTrackTypes.set, mediaTrackTypes.program,
      compositionTypes.visualTrack, compositionTypes.audioTrack],
  }] as const;


export const mediaTrackManifest: ModuleManifest = {
  format: "narratage.module@1",
  name: mediaTrackModuleRef.name,
  version: mediaTrackModuleRef.version,
  dependencies: [
    artifactDependency,
    mediaDependency,
    { module: mediaPipelineModuleRef },
    narrativeDependency,
    semanticMapDependency,
    programSpaceDependency,
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
    { name: mediaTrackProducers.appendProgramItem.name, inputs: [...itemInputs], outputs: [{ name: "set", type: mediaTrackTypes.set }], needs: [] },
    { name: mediaTrackProducers.appendSelectionItem.name, inputs: [...itemInputs, { name: "map", type: semanticMapTypes.complete }, { name: "selection", type: narrativeTypes.selection }], outputs: [{ name: "set", type: mediaTrackTypes.set }], needs: [] },
    { name: mediaTrackProducers.appendSegmentItem.name, inputs: [...itemInputs, { name: "map", type: semanticMapTypes.complete }, { name: "segment", type: narrativeTypes.excerpt }], outputs: [{ name: "set", type: mediaTrackTypes.set }], needs: [] },
    { name: mediaTrackProducers.appendMomentItem.name, inputs: [...itemInputs, { name: "map", type: semanticMapTypes.complete }, { name: "moment", type: narrativeTypes.moment }], outputs: [{ name: "set", type: mediaTrackTypes.set }], needs: [] },
    { name: mediaTrackProducers.bindItemClipPath.name, inputs: [{ name: "spec", type: mediaTrackTypes.itemSpec }, { name: "path", type: spatialTypes.path }], outputs: [{ name: "spec", type: mediaTrackTypes.itemSpec }], needs: [] },
    { name: mediaTrackProducers.bindSequenceClipPath.name, inputs: [{ name: "spec", type: mediaTrackTypes.sequenceSpec }, { name: "path", type: spatialTypes.path }], outputs: [{ name: "spec", type: mediaTrackTypes.sequenceSpec }], needs: [] },
    { name: mediaTrackProducers.createMembers.name, inputs: [], outputs: [{ name: "members", type: mediaTrackTypes.memberSet }], needs: [] },
    { name: mediaTrackProducers.appendMomentMember.name, inputs: [...memberInputs, { name: "moment", type: narrativeTypes.moment }, { name: "space", type: programSpaceTypes.programSpace }], outputs: [{ name: "members", type: mediaTrackTypes.memberSet }], needs: [] },
    { name: mediaTrackProducers.appendSelectionStartMember.name, inputs: [...memberInputs, { name: "selection", type: narrativeTypes.selection }, { name: "space", type: programSpaceTypes.programSpace }], outputs: [{ name: "members", type: mediaTrackTypes.memberSet }], needs: [] },
    { name: mediaTrackProducers.appendSelectionEndMember.name, inputs: [...memberInputs, { name: "selection", type: narrativeTypes.selection }, { name: "space", type: programSpaceTypes.programSpace }], outputs: [{ name: "members", type: mediaTrackTypes.memberSet }], needs: [] },
    { name: mediaTrackProducers.appendSequenceProgramEnd.name, inputs: sequenceInputs, outputs: [{ name: "set", type: mediaTrackTypes.set }], needs: [] },
    { name: mediaTrackProducers.appendSequenceUntilMoment.name, inputs: [...sequenceInputs, { name: "map", type: semanticMapTypes.complete }, { name: "moment", type: narrativeTypes.moment }], outputs: [{ name: "set", type: mediaTrackTypes.set }], needs: [] },
    { name: mediaTrackProducers.appendSequenceUntilSelectionStart.name, inputs: [...sequenceInputs, { name: "map", type: semanticMapTypes.complete }, { name: "selection", type: narrativeTypes.selection }], outputs: [{ name: "set", type: mediaTrackTypes.set }], needs: [] },
    { name: mediaTrackProducers.appendSequenceUntilSelectionEnd.name, inputs: [...sequenceInputs, { name: "map", type: semanticMapTypes.complete }, { name: "selection", type: narrativeTypes.selection }], outputs: [{ name: "set", type: mediaTrackTypes.set }], needs: [] },
    { name: mediaTrackProducers.finalize.name, inputs: [{ name: "set", type: mediaTrackTypes.set }, { name: "header", type: mediaTrackTypes.header }, { name: "space", type: programSpaceTypes.programSpace }], outputs: [{ name: "program", type: mediaTrackTypes.program }], needs: [] },
    { name: mediaTrackProducers.projectVisual.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: mediaTrackTypes.program }], outputs: [{ name: "track", type: compositionTypes.visualTrack }], needs: [] },
    { name: mediaTrackProducers.projectAudio.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: mediaTrackTypes.program }], outputs: [{ name: "track", type: compositionTypes.audioTrack }], needs: [] },
  ],
};

export const mediaTrackDependency = { module: mediaTrackModuleRef } as const;
