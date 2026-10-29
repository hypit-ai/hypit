import {
  assertCompositionIdentity,
  assertAudioReconstructionProgram,
  assertAudioTrackIdentity,
  sealAudioTrack,
} from "@hypit/composition";
import type { AudioTrack, Composition, VisualTrack } from "@hypit/composition";
import type { WorkingPictureSpec } from "@hypit/media";
import type { ContentFit, SpatialFrame } from "@hypit/spatial";
import { assertContentFit, assertSpatialFrame } from "@hypit/spatial";
import {
  assertTemporalMap,
  assertTemporalRelationSpec,
  compareExactTemporalValues,
  assertTemporalWindowFor,
  exactTemporalValueFromFrames,
  exactTemporalValueFromDuration,
  resolveTemporalRelation,
  sealLocalTemporalDomain,
} from "@hypit/temporal";
import type { TemporalWindow } from "@hypit/temporal";
import { assertTimelineIdentity } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import {
  appendCompositionLayer,
  appendVisualClip,
  createMediaLayerSet,
  createVisualTrackSet,
  finalizeVisualTrack,
  projectVisualTrack,
} from "@hypit/visual-track";
import type { MediaSampleAppearance, VisualClipSpec, VisualTrackHeader } from "@hypit/visual-track";

import type { CompositionAudioUse, CompositionOccurrence, CompositionOccurrenceSpec, CompositionVisualUse } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function samePicture(left: WorkingPictureSpec, right: WorkingPictureSpec): boolean {
  return left.colorPrimaries === right.colorPrimaries
    && left.colorTransfer === right.colorTransfer
    && left.referenceWhiteNits === right.referenceWhiteNits
    && left.alphaMode === right.alphaMode;
}

export function createCompositionOccurrence(
  parent: Timeline,
  source: Composition,
  window: TemporalWindow,
  spec: CompositionOccurrenceSpec,
): CompositionOccurrence {
  assertTimelineIdentity(parent);
  assertCompositionIdentity(source);
  assertTemporalWindowFor(window, { timeline: parent });
  assertIdentity(spec.id, "CompositionOccurrenceSpec.id");
  if (spec.sampling !== undefined) assertTemporalRelationSpec(spec.sampling, "CompositionOccurrenceSpec.sampling");
  const sampling = resolveTemporalRelation({
    target: sealLocalTemporalDomain({
      id: `${spec.id}:occurrence`,
      duration: exactTemporalValueFromFrames(window.span.endFrameExclusive - window.span.startFrame, parent),
    }),
    source: sealLocalTemporalDomain({
      id: `${source.id}:timeline`,
      duration: exactTemporalValueFromFrames(source.timeline.frameCount, source.timeline),
    }),
    clock: parent,
    ...(spec.sampling === undefined ? {} : { spec: spec.sampling }),
  });
  return structuredClone({ id: spec.id, source, window, sampling });
}

export function assertCompositionOccurrence(value: CompositionOccurrence, parent?: Timeline): void {
  assertIdentity(value.id, "CompositionOccurrence.id");
  assertCompositionIdentity(value.source);
  assertTemporalMap(value.sampling);
  if (parent !== undefined) assertTemporalWindowFor(value.window, { timeline: parent });
}

export function renderCompositionVisual(
  parent: Timeline,
  picture: WorkingPictureSpec,
  occurrence: CompositionOccurrence,
  use: CompositionVisualUse,
): VisualTrack {
  assertCompositionOccurrence(occurrence, parent);
  assertSpatialFrame(use.frame);
  assertContentFit(use.fit);
  assert(samePicture(picture, occurrence.source.visual.picture),
    `Composition ${occurrence.source.id} WorkingPicture differs from its parent.`);
  const layers = appendCompositionLayer(createMediaLayerSet(), occurrence.source, use.fit, occurrence.sampling, {
    id: `${occurrence.id}:picture`, appearance: use.appearance,
  });
  const set = appendVisualClip(createVisualTrackSet(), use.header, parent, layers, use.frame, use.clip, occurrence.window);
  return projectVisualTrack(parent, finalizeVisualTrack(set, use.header, parent));
}

export function renderCompositionAudio(
  parent: Timeline,
  occurrence: CompositionOccurrence,
  use: CompositionAudioUse,
): AudioTrack {
  assertCompositionOccurrence(occurrence, parent);
  assertIdentity(use.id, "CompositionAudioUse.id");
  assert(Number.isFinite(use.gain) && use.gain >= 0, "CompositionAudioUse.gain is invalid.");
  const fadeIn = exactTemporalValueFromDuration(use.fadeIn, parent);
  const fadeOut = exactTemporalValueFromDuration(use.fadeOut, parent);
  if (use.reconstruction !== undefined) assertAudioReconstructionProgram(use.reconstruction, "CompositionAudioUse.reconstruction");
  const duration = exactTemporalValueFromFrames(
    occurrence.window.span.endFrameExclusive - occurrence.window.span.startFrame,
    parent,
  );
  assert(compareExactTemporalValues(fadeIn, duration) <= 0
    && compareExactTemporalValues(fadeOut, duration) <= 0,
  "CompositionAudioUse fade exceeds its Window.");
  const node = {
    kind: "composition" as const,
    id: use.id,
    composition: structuredClone(occurrence.source),
    target: {
      start: exactTemporalValueFromFrames(occurrence.window.span.startFrame, parent),
      end: exactTemporalValueFromFrames(occurrence.window.span.endFrameExclusive, parent),
    },
    sampling: structuredClone(occurrence.sampling),
    ...(use.reconstruction === undefined ? {} : { reconstruction: structuredClone(use.reconstruction) }),
    gain: use.gain,
    fadeIn,
    fadeOut,
  };
  const track = sealAudioTrack({
    timelineId: parent.id,
    id: use.id,
    graph: { nodes: [node], output: { node: node.id, port: "signal" } },
  });
  assertAudioTrackIdentity(track, parent);
  return track;
}
