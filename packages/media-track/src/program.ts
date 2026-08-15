import {
  assertAudioTrackIdentity,
  assertVisualTrackIdentity,
  sealAudioTrack,
  sealVisualTrack,
} from "@narratage/composition";
import type { AudioClip, AudioTrack, VisualTrack } from "@narratage/composition";
import type { NarrativeExcerpt, NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import {
  assertProgramSpaceIdentity,
  programFrameSampleBoundary,
  programSpaceFrameCount,
  programSpaceSampleFrames,
} from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { canonicalize, digestOf, isDigest } from "@narratage/protocol";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import { assertCanvasSpace, assertSpatialFrame } from "@narratage/spatial";
import type { CanvasSpace } from "@narratage/spatial";
import { assertSpatialPath } from "@narratage/spatial";
import type { SpatialPath } from "@narratage/spatial";
import {
  locateMomentOccurrences,
  locateSelectionOccurrences,
  projectMomentWindows,
  projectProgramWindow,
  projectSegmentWindow,
  projectSelectionWindows,
} from "@narratage/temporal";
import type { ProjectedOccurrence, TemporalDuration, TemporalPointExpression } from "@narratage/temporal";

import {
  assertMediaIdentity,
  assertMediaLayerSet,
  assertMediaVisualOccupancy,
  assertMediaVisualSource,
  assertMediaVisualTrim,
} from "./layers.js";
import { lowerMediaItemElements } from "./lower.js";
import { assertMediaLifecycleMotion, resolveMediaLifecycleMotion } from "./motion.js";
import { assertMediaFramePresentation } from "./presentation.js";
import { assertMediaSoundSet } from "./sounds.js";
import {
  assertMediaHandoffSpec,
  assertMediaSequenceMemberSet,
  assertMediaSequenceSpec,
  lowerMediaSequencePresents,
  resolveMediaSequence,
  sealMediaSequenceSpec,
} from "./sequence.js";
import type {
  MediaFramePresentation,
  MediaItemProgram,
  MediaItemSpec,
  MediaLayerSet,
  MediaSampleLayerProgram,
  MediaSequenceProgram,
  MediaSequenceMemberSet,
  MediaSequenceSpec,
  MediaSoundSource,
  MediaSoundSet,
  MediaTrackHeader,
  MediaTrackProgram,
  MediaTrackSet,
} from "./types.js";

export function bindMediaItemClipPath(spec: MediaItemSpec, path: SpatialPath): MediaItemSpec {
  assertMediaItemSpec(spec);
  assertSpatialPath(path);
  return sealMediaItemSpec({
    ...spec,
    presentation: { ...spec.presentation, clip: { kind: "path", path: structuredClone(path) } },
  });
}

export function bindMediaSequenceClipPath(spec: MediaSequenceSpec, path: SpatialPath): MediaSequenceSpec {
  assertMediaSequenceSpec(spec);
  assertSpatialPath(path);
  return sealMediaSequenceSpec({
    ...spec,
    presentation: { ...spec.presentation, clip: { kind: "path", path: structuredClone(path) } },
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite.`);
}

function assertDuration(value: TemporalDuration, label: string, signed: boolean): void {
  if (value.unit === "seconds") {
    assert(Number.isSafeInteger(value.numerator) && (signed || value.numerator >= 0)
      && Number.isSafeInteger(value.denominator) && value.denominator > 0, `${label} is invalid.`);
  } else {
    assert(Number.isSafeInteger(value.value) && (signed || value.value >= 0), `${label} is invalid.`);
  }
}

function assertPoint(value: TemporalPointExpression, label: string): void {
  assert(["program.start", "program.end", "selection.start", "selection.end", "segment.start", "segment.end", "moment.cue", "absolute"].includes(value.ref),
    `${label}.ref is invalid.`);
  if (value.ref === "absolute") assertDuration(value.at, `${label}.at`, false);
  else if (value.offset !== undefined) assertDuration(value.offset, `${label}.offset`, true);
}

function assertSound(value: MediaSoundSource, label: string): void {
  assert(value.artifact.kind === "blob" && isDigest(value.artifact.digest)
    && value.artifact.mediaType.startsWith("audio/")
    && Number.isSafeInteger(value.artifact.size) && value.artifact.size >= 0
    && Number.isSafeInteger(value.sampleFrames) && value.sampleFrames > 0, `${label} is invalid.`);
}

export function assertMediaItemSpec(value: MediaItemSpec): void {
  assertMediaIdentity(value.id, "MediaItemSpec.id");
  assertPoint(value.projection.start, "MediaItemSpec.projection.start");
  assertPoint(value.projection.end, "MediaItemSpec.projection.end");
  assert(value.expansion.kind === "one" || value.expansion.kind === "each", "MediaItemSpec.expansion is invalid.");
  assertMediaFramePresentation(value.presentation, "MediaItemSpec.presentation");
  assert(Number.isSafeInteger(value.stackingOrder), "MediaItemSpec.stackingOrder must be an integer.");
  if (value.sourceAudio !== undefined) {
    assertMediaIdentity(value.sourceAudio.fromLayer, "MediaItemSpec.sourceAudio.fromLayer");
    finite(value.sourceAudio.gain, "MediaItemSpec.sourceAudio.gain");
    assert(value.sourceAudio.gain >= 0 && value.sourceAudio.gain <= 64, "MediaItemSpec.sourceAudio.gain is invalid.");
  }
}

export function sealMediaItemSpec(value: MediaItemSpec): MediaItemSpec {
  assertMediaItemSpec(value);
  return canonicalize(value) as unknown as MediaItemSpec;
}

export function sealMediaTrackHeader(value: MediaTrackHeader): MediaTrackHeader {
  assertMediaTrackHeader(value);
  return canonicalize(value) as unknown as MediaTrackHeader;
}

export function assertMediaTrackHeader(value: MediaTrackHeader): void {
  assertMediaIdentity(value.id, "MediaTrackHeader.id");
}

export function createMediaTrackSet(): MediaTrackSet {
  return { items: [], sequences: [] };
}

export function assertMediaTrackSet(value: MediaTrackSet): void {
  assert(Array.isArray(value.items)
    && Array.isArray(value.sequences), "MediaTrackSet is invalid.");
}

function realizedItems(
  set: MediaTrackSet,
  header: MediaTrackHeader,
  space: ProgramSpace,
  canvas: CanvasSpace,
  layers: MediaLayerSet,
  frame: MediaItemProgram["frame"],
  spec: MediaItemSpec,
  sounds: MediaSoundSet,
  occurrences: readonly ProjectedOccurrence[],
): MediaTrackSet {
  assertMediaTrackSet(set);
  assertMediaTrackHeader(header);
  assertProgramSpaceIdentity(space);
  assertCanvasSpace(canvas);
  assertMediaLayerSet(layers);
  assert(layers.layers.length > 0, `Media Item ${spec.id} requires at least one layer.`);
  assertSpatialFrame(frame);
  assertMediaItemSpec(spec);
  assertMediaSoundSet(sounds);
  assert(!sounds.sounds.some((sound) => sound.trigger.kind === "handoff"),
    `Media Item ${spec.id} cannot own a Handoff sound.`);
  assert(frame.widthPx > spec.presentation.padding.leftPx + spec.presentation.padding.rightPx
    && frame.heightPx > spec.presentation.padding.topPx + spec.presentation.padding.bottomPx,
  `Media Item ${spec.id} padding consumes its complete Placement Frame.`);
  if (spec.sourceAudio !== undefined) {
    const selected = layers.layers.find((layer) => layer.id === spec.sourceAudio!.fromLayer);
    assert(selected?.kind === "sample" && selected.source.kind === "timed" && selected.source.audio !== undefined,
      `Media Item ${spec.id} source-audio layer is absent or has no normalized audio.`);
  }
  const additions = occurrences.map((occurrence) => {
    const duration = occurrence.span.endFrameExclusive - occurrence.span.startFrame;
    assertMediaLifecycleMotion(spec.motion, duration, `Media Item ${spec.id} motion`);
    const motion = resolveMediaLifecycleMotion(spec.motion, frame, canvas);
    return {
      id: occurrence.id,
      span: { ...occurrence.span },
      frame: { ...frame },
      presentation: structuredClone(spec.presentation),
      layers: structuredClone(layers.layers),
      motion,
      stacking: { order: spec.stackingOrder, tieBreak: `${header.id}:${occurrence.id}` },
      ...(spec.sourceAudio === undefined ? {} : { sourceAudio: { ...spec.sourceAudio } }),
      sounds: structuredClone(sounds.sounds),
    } satisfies MediaItemProgram;
  });
  const ids = new Set([...set.items.map((item) => item.id), ...set.sequences.map((item) => item.id)]);
  for (const item of additions) {
    assert(!ids.has(item.id), `Media Track ${header.id} already contains ${item.id}.`);
    ids.add(item.id);
  }
  return { ...set, items: [...set.items, ...additions] };
}

export function appendProgramMediaItem(
  set: MediaTrackSet,
  header: MediaTrackHeader,
  space: ProgramSpace,
  canvas: CanvasSpace,
  layers: MediaLayerSet,
  frame: MediaItemProgram["frame"],
  spec: MediaItemSpec,
  sounds: MediaSoundSet,
): MediaTrackSet {
  assert(spec.expansion.kind === "one", `Program Media Item ${spec.id} must use one occurrence.`);
  return realizedItems(set, header, space, canvas, layers, frame, spec, sounds, [projectProgramWindow({
    itemId: spec.id,
    space,
    projection: spec.projection,
  })]);
}

export function appendSelectionMediaItem(
  set: MediaTrackSet,
  header: MediaTrackHeader,
  space: ProgramSpace,
  canvas: CanvasSpace,
  layers: MediaLayerSet,
  frame: MediaItemProgram["frame"],
  map: CompleteSemanticMap,
  selection: NarrativeSelectionRef,
  spec: MediaItemSpec,
  sounds: MediaSoundSet,
): MediaTrackSet {
  return realizedItems(set, header, space, canvas, layers, frame, spec, sounds, projectSelectionWindows({
    itemId: spec.id, map, selection, space, expansion: spec.expansion, projection: spec.projection,
  }));
}

export function appendSegmentMediaItem(
  set: MediaTrackSet,
  header: MediaTrackHeader,
  space: ProgramSpace,
  canvas: CanvasSpace,
  layers: MediaLayerSet,
  frame: MediaItemProgram["frame"],
  map: CompleteSemanticMap,
  segment: NarrativeExcerpt,
  spec: MediaItemSpec,
  sounds: MediaSoundSet,
): MediaTrackSet {
  assert(spec.expansion.kind === "one", `Segment Media Item ${spec.id} must use one occurrence.`);
  return realizedItems(set, header, space, canvas, layers, frame, spec, sounds, [projectSegmentWindow({
    itemId: spec.id, map, segment, space, projection: spec.projection,
  })]);
}

export function appendMomentMediaItem(
  set: MediaTrackSet,
  header: MediaTrackHeader,
  space: ProgramSpace,
  canvas: CanvasSpace,
  layers: MediaLayerSet,
  frame: MediaItemProgram["frame"],
  map: CompleteSemanticMap,
  moment: NarrativeMomentRef,
  spec: MediaItemSpec,
  sounds: MediaSoundSet,
): MediaTrackSet {
  return realizedItems(set, header, space, canvas, layers, frame, spec, sounds, projectMomentWindows({
    itemId: spec.id, map, moment, space, expansion: spec.expansion, projection: spec.projection,
  }));
}

function assertSampleLayerForSpace(layer: MediaSampleLayerProgram, space: ProgramSpace, label: string): void {
  assertMediaVisualSource(layer.source, `${label}.source`);
  const timing = layer.source.kind === "timed" ? { frameRate: layer.source.frameRate, frameCount: layer.source.frameCount }
    : layer.source.kind === "surface" && layer.source.surface.timing.kind === "frames"
      ? layer.source.surface.timing : undefined;
  if (timing === undefined) return;
  assert(timing.frameRate.numerator === space.frameRate.numerator
    && timing.frameRate.denominator === space.frameRate.denominator,
  `${label} is not normalized to ProgramSpace frame rate.`);
  if (layer.trim !== undefined) assertMediaVisualTrim(layer.trim, timing.frameCount, `${label}.trim`);
  assert(layer.occupancy !== undefined, `${label} requires occupancy.`);
  assertMediaVisualOccupancy(layer.occupancy, `${label}.occupancy`);
}

function assertItem(item: MediaItemProgram, space: ProgramSpace, label: string): void {
  assertMediaIdentity(item.id, `${label}.id`);
  assert(Number.isSafeInteger(item.span.startFrame) && Number.isSafeInteger(item.span.endFrameExclusive)
    && item.span.startFrame >= 0 && item.span.endFrameExclusive > item.span.startFrame
    && item.span.endFrameExclusive <= programSpaceFrameCount(space), `${label}.span is invalid.`);
  assertSpatialFrame(item.frame);
  assertMediaFramePresentation(item.presentation, `${label}.presentation`);
  assertMediaLifecycleMotion(item.motion, item.span.endFrameExclusive - item.span.startFrame, `${label}.motion`);
  assert(item.motion.enter?.origin === undefined && item.motion.exit?.origin === undefined,
    `${label}.motion contains an unresolved Canvas origin.`);
  assert(Number.isSafeInteger(item.stacking.order) && item.stacking.tieBreak.length > 0, `${label}.stacking is invalid.`);
  assert(item.layers.length > 0, `${label} requires layers.`);
  const layerSet: MediaLayerSet = { layers: item.layers };
  assertMediaLayerSet(layerSet);
  for (const layer of item.layers) if (layer.kind === "sample") assertSampleLayerForSpace(layer, space, `${label}.${layer.id}`);
  if (item.sourceAudio !== undefined) {
    const selected = item.layers.find((layer) => layer.id === item.sourceAudio!.fromLayer);
    assert(selected?.kind === "sample" && selected.source.kind === "timed" && selected.source.audio !== undefined,
      `${label}.sourceAudio is invalid.`);
  }
  assertMediaSoundSet({ sounds: item.sounds });
  assert(!item.sounds.some((sound) => sound.trigger.kind === "handoff"), `${label} owns a Handoff sound.`);
}

export function appendMediaSequence(
  set: MediaTrackSet,
  header: MediaTrackHeader,
  space: ProgramSpace,
  canvas: CanvasSpace,
  members: MediaSequenceMemberSet,
  frame: MediaSequenceProgram["frame"],
  spec: MediaSequenceSpec,
  sounds: MediaSoundSet,
  terminalFrame: number,
): MediaTrackSet {
  assertMediaTrackSet(set);
  assertMediaSequenceMemberSet(members);
  assertMediaSequenceSpec(spec);
  const sequence = resolveMediaSequence(header, space, canvas, members, frame, spec, sounds, terminalFrame);
  assert(!set.items.some((item) => item.id === sequence.id)
    && !set.sequences.some((item) => item.id === sequence.id),
  `Media Track ${header.id} already contains ${sequence.id}.`);
  return { ...set, sequences: [...set.sequences, sequence] };
}

function exactlyOneTerminalFrame(values: readonly number[], label: string): number {
  assert(values.length === 1, `${label} requires exactly one occurrence; received ${values.length}.`);
  return values[0]!;
}

export function appendMediaSequenceUntilProgramEnd(
  set: MediaTrackSet,
  header: MediaTrackHeader,
  space: ProgramSpace,
  canvas: CanvasSpace,
  members: MediaSequenceMemberSet,
  frame: MediaSequenceProgram["frame"],
  spec: MediaSequenceSpec,
  sounds: MediaSoundSet,
): MediaTrackSet {
  return appendMediaSequence(set, header, space, canvas, members, frame, spec, sounds, programSpaceFrameCount(space));
}

export function appendMediaSequenceUntilMoment(
  set: MediaTrackSet,
  header: MediaTrackHeader,
  space: ProgramSpace,
  canvas: CanvasSpace,
  members: MediaSequenceMemberSet,
  frame: MediaSequenceProgram["frame"],
  spec: MediaSequenceSpec,
  sounds: MediaSoundSet,
  map: CompleteSemanticMap,
  moment: NarrativeMomentRef,
): MediaTrackSet {
  const terminalFrame = exactlyOneTerminalFrame(
    locateMomentOccurrences(map, moment, space).map((occurrence) => occurrence.cue.frame),
    `Media Sequence ${spec.id} terminal Moment`,
  );
  return appendMediaSequence(set, header, space, canvas, members, frame, spec, sounds, terminalFrame);
}

export function appendMediaSequenceUntilSelection(
  set: MediaTrackSet,
  header: MediaTrackHeader,
  space: ProgramSpace,
  canvas: CanvasSpace,
  members: MediaSequenceMemberSet,
  frame: MediaSequenceProgram["frame"],
  spec: MediaSequenceSpec,
  sounds: MediaSoundSet,
  map: CompleteSemanticMap,
  selection: NarrativeSelectionRef,
  boundary: "start" | "end",
): MediaTrackSet {
  const terminalFrame = exactlyOneTerminalFrame(
    locateSelectionOccurrences(map, selection, space).map((occurrence) =>
      boundary === "start" ? occurrence.start.frame : occurrence.end.frame),
    `Media Sequence ${spec.id} terminal Selection`,
  );
  return appendMediaSequence(set, header, space, canvas, members, frame, spec, sounds, terminalFrame);
}

function assertSequence(sequence: MediaSequenceProgram, space: ProgramSpace, label: string): void {
  assertMediaIdentity(sequence.id, `${label}.id`);
  assert(sequence.span.startFrame >= 0 && sequence.span.endFrameExclusive <= programSpaceFrameCount(space)
    && sequence.span.endFrameExclusive > sequence.span.startFrame
    && sequence.terminalFrame === sequence.span.endFrameExclusive, `${label}.span is invalid.`);
  assertSpatialFrame(sequence.frame);
  assertMediaFramePresentation(sequence.presentation, `${label}.presentation`);
  assertMediaLifecycleMotion(sequence.motion, sequence.span.endFrameExclusive - sequence.span.startFrame, `${label}.motion`);
  assert(sequence.motion.enter?.origin === undefined && sequence.motion.exit?.origin === undefined,
    `${label}.motion contains an unresolved Canvas origin.`);
  assert(sequence.members.length >= 2 && sequence.handoffs.length === sequence.members.length - 1,
    `${label} topology is invalid.`);
  for (const [index, member] of sequence.members.entries()) {
    assertMediaIdentity(member.id, `${label}.members.${index}.id`);
    assert(member.activationFrame === member.logicalSpan.startFrame
      && member.logicalSpan.startFrame >= sequence.span.startFrame
      && member.logicalSpan.endFrameExclusive <= sequence.terminalFrame
      && member.logicalSpan.endFrameExclusive > member.logicalSpan.startFrame,
    `${label}.members.${index}.logicalSpan is invalid.`);
    assert(member.visualSpan.startFrame <= member.logicalSpan.startFrame
      && member.visualSpan.endFrameExclusive >= member.logicalSpan.endFrameExclusive,
    `${label}.members.${index}.visualSpan does not contain its logical phase.`);
    const layerSet: MediaLayerSet = { layers: member.layers };
    assertMediaLayerSet(layerSet);
    for (const layer of member.layers) if (layer.kind === "sample") {
      assertSampleLayerForSpace(layer, space, `${label}.members.${index}.${layer.id}`);
    }
    if (member.sourceAudio !== undefined) {
      const selected = member.layers.find((layer) => layer.id === member.sourceAudio!.fromLayer);
      assert(selected?.kind === "sample" && selected.source.kind === "timed" && selected.source.audio !== undefined,
        `${label}.members.${index}.sourceAudio is invalid.`);
    }
  }
  for (const [index, handoff] of sequence.handoffs.entries()) {
    assertMediaHandoffSpec(handoff);
    assert(handoff.fromMemberId === sequence.members[index]!.id
      && handoff.toMemberId === sequence.members[index + 1]!.id
      && handoff.span.startFrame <= sequence.members[index]!.logicalSpan.endFrameExclusive
      && handoff.span.endFrameExclusive >= sequence.members[index + 1]!.logicalSpan.startFrame,
    `${label}.handoffs.${index} is disconnected.`);
  }
  assertMediaSoundSet({ sounds: sequence.sounds });
  for (const sound of sequence.sounds) {
    if (sound.trigger.kind === "handoff") {
      const { handoffId } = sound.trigger;
      assert(sequence.handoffs.some((handoff) => handoff.id === handoffId),
        `${label} sound ${sound.id} targets an unknown Handoff.`);
    }
  }
}

function normalizeProgram(value: MediaTrackProgram): MediaTrackProgram {
  return {

    id: value.id,
    items: [...value.items].map((item) => structuredClone(item)).sort((left, right) => left.id.localeCompare(right.id)),
    sequences: [...value.sequences].map((item) => structuredClone(item)).sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function sealMediaTrackProgram(value: MediaTrackProgram, space: ProgramSpace): MediaTrackProgram {
  const normalized = normalizeProgram(value);
  assertMediaTrackProgramIdentity(normalized, space);
  return canonicalize(normalized) as unknown as MediaTrackProgram;
}

export function finalizeMediaTrack(set: MediaTrackSet, header: MediaTrackHeader, space: ProgramSpace): MediaTrackProgram {
  assertMediaTrackSet(set);
  assertMediaTrackHeader(header);
  assert(set.items.length + set.sequences.length > 0, "Media Track requires at least one Item or Sequence.");
  return sealMediaTrackProgram({

    id: header.id,
    items: set.items,
    sequences: set.sequences,
  }, space);
}

export function assertMediaTrackProgram(value: MediaTrackProgram): void {
  assertMediaIdentity(value.id, "MediaTrackProgram.id");
  assert(Array.isArray(value.items) && Array.isArray(value.sequences)
    && value.items.length + value.sequences.length > 0, "MediaTrackProgram is empty.");
}

export function assertMediaTrackProgramIdentity(value: MediaTrackProgram, space: ProgramSpace): void {
  assertMediaTrackProgram(value);
  assertProgramSpaceIdentity(space);
  const ids = new Set<string>();
  for (const item of value.items) {
    assert(!ids.has(item.id), `MediaTrackProgram repeats ${item.id}.`);
    ids.add(item.id);
    assertItem(item, space, `Media Item ${item.id}`);
  }
  for (const sequence of value.sequences) {
    assert(!ids.has(sequence.id), `MediaTrackProgram repeats ${sequence.id}.`);
    ids.add(sequence.id);
    assertSequence(sequence, space, `Media Sequence ${sequence.id}`);
  }
}

export function projectMediaVisualTrack(space: ProgramSpace, program: MediaTrackProgram): VisualTrack {
  assertMediaTrackProgramIdentity(program, space);
  const track = sealVisualTrack({
    visualIr: "narratage.visual-ir@1",
    id: program.id,
    presents: [
      ...program.items.map((item) => ({
      id: item.id,
      span: { ...item.span },
      stacking: { ...item.stacking },
      elements: lowerMediaItemElements(item, space),
      })),
      ...program.sequences.flatMap((sequence) => lowerMediaSequencePresents(sequence, space)),
    ],
  });
  assertVisualTrackIdentity(track, space);
  return track;
}

function sourceSampleBoundary(frame: number, frameCount: number, sampleFrames: number): number {
  const numerator = BigInt(frame) * BigInt(sampleFrames);
  const denominator = BigInt(frameCount);
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  assert(rounded <= BigInt(Number.MAX_SAFE_INTEGER), "Media source sample boundary exceeds safe arithmetic.");
  return Number(rounded);
}

function sourceAudioClip(
  value: Pick<MediaItemProgram, "id" | "span" | "layers" | "sourceAudio">,
  space: ProgramSpace,
  fades: { readonly inSamples: number; readonly outSamples: number } = { inSamples: 0, outSamples: 0 },
): AudioClip | undefined {
  if (value.sourceAudio === undefined) return undefined;
  const layer = value.layers.find((candidate): candidate is MediaSampleLayerProgram =>
    candidate.kind === "sample" && candidate.id === value.sourceAudio!.fromLayer)!;
  assert(layer.source.kind === "timed" && layer.source.audio !== undefined && layer.occupancy !== undefined,
    `Media projection ${value.id} selected audio from an invalid layer.`);
  const source = layer.source;
  const audio = source.audio;
  assert(audio !== undefined, `Media projection ${value.id} selected audio from an invalid layer.`);
  const trim = layer.trim ?? { startFrame: 0, endFrameExclusive: source.frameCount };
  const sourceStart = sourceSampleBoundary(trim.startFrame, source.frameCount, audio.sampleFrames);
  const sourceEnd = sourceSampleBoundary(trim.endFrameExclusive, source.frameCount, audio.sampleFrames);
  const targetWindowStart = programFrameSampleBoundary(space, value.span.startFrame, 48_000);
  const targetWindowEnd = programFrameSampleBoundary(space, value.span.endFrameExclusive, 48_000);
  const targetFrames = value.span.endFrameExclusive - value.span.startFrame;
  const sourceFrames = trim.endFrameExclusive - trim.startFrame;
  let targetStart = targetWindowStart;
  let targetEnd = targetWindowEnd;
  let clipSourceStart = sourceStart;
  let clipSourceEnd = sourceEnd;
  let loop = false;
  let phaseSample = 0;
  let playbackRate = 1;
  if (layer.occupancy.mode === "once" || layer.occupancy.mode === "hold") {
    const playedFrames = Math.min(targetFrames, sourceFrames);
    if (layer.occupancy.align === "start") {
      targetEnd = programFrameSampleBoundary(space, value.span.startFrame + playedFrames, 48_000);
      clipSourceEnd = sourceSampleBoundary(trim.startFrame + playedFrames, source.frameCount, audio.sampleFrames);
    } else {
      targetStart = programFrameSampleBoundary(space, value.span.endFrameExclusive - playedFrames, 48_000);
      clipSourceStart = sourceSampleBoundary(trim.endFrameExclusive - playedFrames, source.frameCount, audio.sampleFrames);
    }
  } else if (layer.occupancy.mode === "loop") {
    loop = true;
    if (layer.occupancy.align === "end") {
      const phaseFrames = (sourceFrames - (targetFrames % sourceFrames)) % sourceFrames;
      phaseSample = sourceSampleBoundary(trim.startFrame + phaseFrames, source.frameCount, audio.sampleFrames) - sourceStart;
    }
  } else {
    playbackRate = (sourceEnd - sourceStart) / (targetWindowEnd - targetWindowStart);
  }
  const audible = targetEnd - targetStart;
  assert(fades.inSamples <= audible && fades.outSamples <= audible,
    `Media projection ${value.id} source audio is too short for its authored crossfade.`);
  return {
    id: `${value.id}:source-audio`,
    artifact: structuredClone(audio.artifact),
    target: { startSample: targetStart, endSampleExclusive: targetEnd },
    source: {
      sampleFrames: audio.sampleFrames,
      startSample: clipSourceStart,
      endSampleExclusive: clipSourceEnd,
      loop,
      phaseSample,
    },
    playbackRate,
    pitch: "preserve",
    gain: value.sourceAudio.gain,
    fadeInSamples: fades.inSamples,
    fadeOutSamples: fades.outSamples,
  };
}

function soundClip(
  id: string,
  source: MediaSoundSource,
  gain: number,
  point: number,
  space: ProgramSpace,
): AudioClip {
  const total = programSpaceSampleFrames(space, 48_000);
  const targetStart = programFrameSampleBoundary(space, point, 48_000);
  const audible = Math.min(source.sampleFrames, Math.max(0, total - targetStart));
  assert(audible > 0, `Media sound ${id} begins outside ProgramSpace.`);
  return {
    id,
    artifact: structuredClone(source.artifact),
    target: { startSample: targetStart, endSampleExclusive: targetStart + audible },
    source: {
      sampleFrames: source.sampleFrames,
      startSample: 0,
      endSampleExclusive: audible,
      loop: false,
      phaseSample: 0,
    },
    playbackRate: 1,
    pitch: "preserve",
    gain,
    fadeInSamples: 0,
    fadeOutSamples: 0,
  };
}

function edgeSoundClips(
  value: Pick<MediaItemProgram, "id" | "span" | "motion" | "sounds">,
  space: ProgramSpace,
): AudioClip[] {
  return value.sounds.flatMap((sound) => {
    if (sound.trigger.kind === "handoff") return [];
    const point = sound.trigger.kind === "enter"
      ? value.span.startFrame
      : value.span.endFrameExclusive - (value.motion.exit?.durationFrames ?? 0);
    return [soundClip(`${value.id}:${sound.id}`, sound.source, sound.gain, point, space)];
  });
}

function sequenceAudioClips(sequence: MediaSequenceProgram, space: ProgramSpace): AudioClip[] {
  const sourceClips = sequence.members.flatMap((member, index) => {
    if (member.sourceAudio === undefined) return [];
    const incoming = sequence.handoffs[index - 1];
    const outgoing = sequence.handoffs[index];
    const span = {
      startFrame: incoming?.audio === "crossfade" ? incoming.span.startFrame : member.logicalSpan.startFrame,
      endFrameExclusive: outgoing?.audio === "crossfade"
        ? outgoing.span.endFrameExclusive : member.logicalSpan.endFrameExclusive,
    };
    const fadeInSamples = incoming?.audio === "crossfade"
      ? programFrameSampleBoundary(space, incoming.span.endFrameExclusive, 48_000)
        - programFrameSampleBoundary(space, incoming.span.startFrame, 48_000)
      : 0;
    const fadeOutSamples = outgoing?.audio === "crossfade"
      ? programFrameSampleBoundary(space, outgoing.span.endFrameExclusive, 48_000)
        - programFrameSampleBoundary(space, outgoing.span.startFrame, 48_000)
      : 0;
    const clip = sourceAudioClip({
      id: `${sequence.id}:${member.id}`,
      span,
      layers: member.layers,
      sourceAudio: member.sourceAudio,
    }, space, { inSamples: fadeInSamples, outSamples: fadeOutSamples });
    return clip === undefined ? [] : [clip];
  });
  const handoffSounds = sequence.sounds.flatMap((sound) => {
    if (sound.trigger.kind !== "handoff") return [];
    const { handoffId } = sound.trigger;
    const handoff = sequence.handoffs.find((candidate) => candidate.id === handoffId)!;
    return [soundClip(
      `${sequence.id}:${sound.id}`, sound.source, sound.gain,
      sequence.members.find((member) => member.id === handoff.toMemberId)!.activationFrame, space,
    )];
  });
  return [
    ...sourceClips,
    ...edgeSoundClips({
      id: sequence.id,
      span: sequence.span,
      motion: sequence.motion,
      sounds: sequence.sounds,
    }, space),
    ...handoffSounds,
  ];
}

export function projectMediaAudioTrack(space: ProgramSpace, program: MediaTrackProgram): AudioTrack {
  assertMediaTrackProgramIdentity(program, space);
  const clips = program.items.flatMap((item) => {
    const source = sourceAudioClip(item, space);
    return [...(source === undefined ? [] : [source]), ...edgeSoundClips(item, space)];
  }).concat(program.sequences.flatMap((sequence) => sequenceAudioClips(sequence, space)));
  assert(clips.length > 0, `Media Program ${program.id} has no explicitly authored audio projection.`);
  const track = sealAudioTrack({ id: `${program.id}:audio`, clips });
  assertAudioTrackIdentity(track, space);
  return track;
}
