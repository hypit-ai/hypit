import type { ComponentPackage, ProducerHandlerContext } from "@narratage/component-kit";
import type { CompositableSurfaceRef, SynchronizedMedia } from "@narratage/media";
import type { NarrativeExcerpt, NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import type { ProgramSpace } from "@narratage/program-space";
import { canonicalize } from "@narratage/protocol";
import type { BlobRef, StoredValue } from "@narratage/protocol";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import type { CanvasSpace, ContentFit, IntrinsicExtent, SpatialFrame, SpatialPath } from "@narratage/spatial";

import {
  appendMediaPaintLayer,
  appendStillMediaLayer,
  appendSurfaceMediaLayer,
  appendTimedMediaLayer,
  createMediaLayerSet,
} from "./layers.js";
import { mediaTrackProducers, mediaTrackTypes } from "./manifest.js";
import { appendMediaSequenceUntilMoment, appendMediaSequenceUntilProgramEnd, appendMediaSequenceUntilSelection, appendMomentMediaItem, appendProgramMediaItem, appendSegmentMediaItem, appendSelectionMediaItem, bindMediaItemClipPath, bindMediaSequenceClipPath, assertMediaTrackProgram, createMediaTrackSet, finalizeMediaTrack, projectMediaAudioTrack, projectMediaVisualTrack } from "./program.js";
import {
  appendMediaSequenceMomentMember,
  appendMediaSequenceSelectionMember,
  createMediaSequenceMemberSet,
} from "./sequence.js";
import {
  appendMediaSound,
  createMediaSoundSet,
} from "./sounds.js";
import type {
  MediaItemSpec,
  MediaLayerSet,
  MediaPaintLayerSpec,
  MediaSampleLayerSpec,
  MediaSoundSet,
  MediaSoundSpec,
  MediaSequenceMemberSet,
  MediaSequenceMemberSpec,
  MediaSequenceSpec,
  MediaTrackHeader,
  MediaTrackProgram,
  MediaTrackSet,
} from "./types.js";

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}
function blob(value: StoredValue | undefined): BlobRef {
  if (value?.kind !== "blob") throw new Error("Media source must be a BlobArtifact.");
  return value;
}
const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

function itemInputs(inputs: ProducerHandlerContext["inputs"]) {
  return {
    set: inline<MediaTrackSet>(inputs.set?.value, "MediaTrackSet"),
    header: inline<MediaTrackHeader>(inputs.header?.value, "MediaTrackHeader"),
    space: inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
    canvas: inline<CanvasSpace>(inputs.canvas?.value, "CanvasSpace"),
    layers: inline<MediaLayerSet>(inputs.layers?.value, "MediaLayerSet"),
    frame: inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
    spec: inline<MediaItemSpec>(inputs.spec?.value, "MediaItemSpec"),
    sounds: inline<MediaSoundSet>(inputs.sounds?.value, "MediaSoundSet"),
  };
}

function memberInputs(inputs: ProducerHandlerContext["inputs"]) {
  return {
    members: inline<MediaSequenceMemberSet>(inputs.members?.value, "MediaSequenceMemberSet"),
    layers: inline<MediaLayerSet>(inputs.layers?.value, "MediaLayerSet"),
    spec: inline<MediaSequenceMemberSpec>(inputs.spec?.value, "MediaSequenceMemberSpec"),
    map: inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
    space: inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
  };
}

function sequenceInputs(inputs: ProducerHandlerContext["inputs"]) {
  return {
    set: inline<MediaTrackSet>(inputs.set?.value, "MediaTrackSet"),
    header: inline<MediaTrackHeader>(inputs.header?.value, "MediaTrackHeader"),
    space: inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
    canvas: inline<CanvasSpace>(inputs.canvas?.value, "CanvasSpace"),
    members: inline<MediaSequenceMemberSet>(inputs.members?.value, "MediaSequenceMemberSet"),
    frame: inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
    spec: inline<MediaSequenceSpec>(inputs.spec?.value, "MediaSequenceSpec"),
    sounds: inline<MediaSoundSet>(inputs.sounds?.value, "MediaSoundSet"),
  };
}

export const mediaTrackComponent = {
  producers: [
    { producer: mediaTrackProducers.createLayers, handler: () => ({ outputs: { layers: output(createMediaLayerSet()) }, needs: {} }) },
    { producer: mediaTrackProducers.appendPaintLayer, handler: ({ inputs }) => ({ outputs: { layers: output(appendMediaPaintLayer(
      inline<MediaLayerSet>(inputs.layers?.value, "MediaLayerSet"),
      inline<MediaPaintLayerSpec>(inputs.spec?.value, "MediaPaintLayerSpec"),
    )) }, needs: {} }) },
    { producer: mediaTrackProducers.appendStillLayer, handler: ({ inputs }) => ({ outputs: { layers: output(appendStillMediaLayer(
      inline<MediaLayerSet>(inputs.layers?.value, "MediaLayerSet"), blob(inputs.source?.value),
      inline<IntrinsicExtent>(inputs.extent?.value, "IntrinsicExtent"), inline<ContentFit>(inputs.fit?.value, "ContentFit"),
      inline<MediaSampleLayerSpec>(inputs.spec?.value, "MediaSampleLayerSpec"),
    )) }, needs: {} }) },
    { producer: mediaTrackProducers.appendTimedLayer, handler: ({ inputs }) => ({ outputs: { layers: output(appendTimedMediaLayer(
      inline<MediaLayerSet>(inputs.layers?.value, "MediaLayerSet"), inline<SynchronizedMedia>(inputs.source?.value, "SynchronizedMedia"),
      inline<ContentFit>(inputs.fit?.value, "ContentFit"), inline<MediaSampleLayerSpec>(inputs.spec?.value, "MediaSampleLayerSpec"),
    )) }, needs: {} }) },
    { producer: mediaTrackProducers.appendSurfaceLayer, handler: ({ inputs }) => ({ outputs: { layers: output(appendSurfaceMediaLayer(
      inline<MediaLayerSet>(inputs.layers?.value, "MediaLayerSet"), inline<CompositableSurfaceRef>(inputs.source?.value, "CompositableSurfaceRef"),
      inline<ContentFit>(inputs.fit?.value, "ContentFit"), inline<MediaSampleLayerSpec>(inputs.spec?.value, "MediaSampleLayerSpec"),
    )) }, needs: {} }) },
    { producer: mediaTrackProducers.createSounds, handler: () => ({ outputs: { sounds: output(createMediaSoundSet()) }, needs: {} }) },
    { producer: mediaTrackProducers.appendSound, handler: ({ inputs }) => ({ outputs: { sounds: output(appendMediaSound(
      inline<MediaSoundSet>(inputs.sounds?.value, "MediaSoundSet"),
      inline<SynchronizedMedia>(inputs.source?.value, "SynchronizedMedia"),
      inline<MediaSoundSpec>(inputs.spec?.value, "MediaSoundSpec"),
    )) }, needs: {} }) },
    { producer: mediaTrackProducers.createSet, handler: () => ({ outputs: { set: output(createMediaTrackSet()) }, needs: {} }) },
    { producer: mediaTrackProducers.appendProgramItem, handler: ({ inputs }) => {
      const value = itemInputs(inputs);
      return { outputs: { set: output(appendProgramMediaItem(value.set, value.header, value.space, value.canvas, value.layers, value.frame, value.spec, value.sounds)) }, needs: {} };
    } },
    { producer: mediaTrackProducers.appendSelectionItem, handler: ({ inputs }) => {
      const value = itemInputs(inputs);
      return { outputs: { set: output(appendSelectionMediaItem(value.set, value.header, value.space, value.canvas, value.layers, value.frame,
        inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
        inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelectionRef"), value.spec, value.sounds)) }, needs: {} };
    } },
    { producer: mediaTrackProducers.appendSegmentItem, handler: ({ inputs }) => {
      const value = itemInputs(inputs);
      return { outputs: { set: output(appendSegmentMediaItem(value.set, value.header, value.space, value.canvas, value.layers, value.frame,
        inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
        inline<NarrativeExcerpt>(inputs.segment?.value, "NarrativeExcerpt"), value.spec, value.sounds)) }, needs: {} };
    } },
    { producer: mediaTrackProducers.appendMomentItem, handler: ({ inputs }) => {
      const value = itemInputs(inputs);
      return { outputs: { set: output(appendMomentMediaItem(value.set, value.header, value.space, value.canvas, value.layers, value.frame,
        inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
        inline<NarrativeMomentRef>(inputs.moment?.value, "NarrativeMomentRef"), value.spec, value.sounds)) }, needs: {} };
    } },
    { producer: mediaTrackProducers.bindItemClipPath, handler: ({ inputs }) => ({ outputs: { spec: output(bindMediaItemClipPath(
      inline<MediaItemSpec>(inputs.spec?.value, "MediaItemSpec"),
      inline<SpatialPath>(inputs.path?.value, "SpatialPath"),
    )) }, needs: {} }) },
    { producer: mediaTrackProducers.bindSequenceClipPath, handler: ({ inputs }) => ({ outputs: { spec: output(bindMediaSequenceClipPath(
      inline<MediaSequenceSpec>(inputs.spec?.value, "MediaSequenceSpec"),
      inline<SpatialPath>(inputs.path?.value, "SpatialPath"),
    )) }, needs: {} }) },
    { producer: mediaTrackProducers.createMembers, handler: () => ({ outputs: { members: output(createMediaSequenceMemberSet()) }, needs: {} }) },
    { producer: mediaTrackProducers.appendMomentMember, handler: ({ inputs }) => {
      const value = memberInputs(inputs);
      return { outputs: { members: output(appendMediaSequenceMomentMember(
        value.members, value.layers, value.spec, value.map,
        inline<NarrativeMomentRef>(inputs.moment?.value, "NarrativeMomentRef"), value.space,
      )) }, needs: {} };
    } },
    { producer: mediaTrackProducers.appendSelectionStartMember, handler: ({ inputs }) => {
      const value = memberInputs(inputs);
      return { outputs: { members: output(appendMediaSequenceSelectionMember(
        value.members, value.layers, value.spec, value.map,
        inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelectionRef"), value.space, "start",
      )) }, needs: {} };
    } },
    { producer: mediaTrackProducers.appendSelectionEndMember, handler: ({ inputs }) => {
      const value = memberInputs(inputs);
      return { outputs: { members: output(appendMediaSequenceSelectionMember(
        value.members, value.layers, value.spec, value.map,
        inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelectionRef"), value.space, "end",
      )) }, needs: {} };
    } },
    { producer: mediaTrackProducers.appendSequenceProgramEnd, handler: ({ inputs }) => {
      const value = sequenceInputs(inputs);
      return { outputs: { set: output(appendMediaSequenceUntilProgramEnd(
        value.set, value.header, value.space, value.canvas, value.members, value.frame, value.spec, value.sounds,
      )) }, needs: {} };
    } },
    { producer: mediaTrackProducers.appendSequenceUntilMoment, handler: ({ inputs }) => {
      const value = sequenceInputs(inputs);
      return { outputs: { set: output(appendMediaSequenceUntilMoment(
        value.set, value.header, value.space, value.canvas, value.members, value.frame, value.spec, value.sounds,
        inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
        inline<NarrativeMomentRef>(inputs.moment?.value, "NarrativeMomentRef"),
      )) }, needs: {} };
    } },
    { producer: mediaTrackProducers.appendSequenceUntilSelectionStart, handler: ({ inputs }) => {
      const value = sequenceInputs(inputs);
      return { outputs: { set: output(appendMediaSequenceUntilSelection(
        value.set, value.header, value.space, value.canvas, value.members, value.frame, value.spec, value.sounds,
        inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
        inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelectionRef"), "start",
      )) }, needs: {} };
    } },
    { producer: mediaTrackProducers.appendSequenceUntilSelectionEnd, handler: ({ inputs }) => {
      const value = sequenceInputs(inputs);
      return { outputs: { set: output(appendMediaSequenceUntilSelection(
        value.set, value.header, value.space, value.canvas, value.members, value.frame, value.spec, value.sounds,
        inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
        inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelectionRef"), "end",
      )) }, needs: {} };
    } },
    { producer: mediaTrackProducers.finalize, handler: ({ inputs }) => ({ outputs: { program: output(finalizeMediaTrack(
      inline<MediaTrackSet>(inputs.set?.value, "MediaTrackSet"), inline<MediaTrackHeader>(inputs.header?.value, "MediaTrackHeader"),
      inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
    )) }, needs: {} }) },
    { producer: mediaTrackProducers.projectVisual, handler: ({ inputs }) => ({ outputs: { track: output(projectMediaVisualTrack(
      inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"), inline<MediaTrackProgram>(inputs.program?.value, "MediaTrackProgram"),
    )) }, needs: {} }) },
    { producer: mediaTrackProducers.projectAudio, handler: ({ inputs }) => ({ outputs: { track: output(projectMediaAudioTrack(
      inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"), inline<MediaTrackProgram>(inputs.program?.value, "MediaTrackProgram"),
    )) }, needs: {} }) },
  ],
  validators: [{
    type: mediaTrackTypes.program,
    handler: ({ value }) => assertMediaTrackProgram(inline<MediaTrackProgram>(value, "MediaTrackProgram")),
  }],
} satisfies ComponentPackage;
