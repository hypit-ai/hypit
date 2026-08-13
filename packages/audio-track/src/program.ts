import { assertAudioTrackIdentity, sealAudioTrack } from "@narratage/composition";
import type { AudioClip, AudioTrack } from "@narratage/composition";
import { synchronizedMediaSampleFrames, verifySynchronizedMedia } from "@narratage/media";
import type { SynchronizedMedia } from "@narratage/media";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import {
  assertProgramSpaceIdentity,
  programFrameSampleBoundary,
  programSpaceSampleFrames,
} from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { canonicalize, digestOf, isDigest } from "@narratage/protocol";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import {
  projectMomentWindows,
  projectProgramWindow,
  projectSelectionWindows,
  temporalDurationInSamples,
} from "@narratage/temporal";
import type { ProjectedOccurrence, TemporalDuration } from "@narratage/temporal";

import type {
  AudioClipSpec,
  AudioItemProgram,
  AudioOccupancy,
  AudioTrackHeader,
  AudioTrackProgram,
  AudioTrackSet,
} from "./types.js";

export const audioTrackImplementationDigests = {
  createSet: digestOf("@narratage/audio-track/create-set@1"),
  appendProgram: digestOf("@narratage/audio-track/append-program@1"),
  appendSelection: digestOf("@narratage/audio-track/append-selection@1"),
  appendMoment: digestOf("@narratage/audio-track/append-moment@1"),
  finalize: digestOf("@narratage/audio-track/finalize@1"),
  render: digestOf("@narratage/audio-track/render@1"),
} as const;

export const audioTrackValidatorDigests = {
  program: digestOf("@narratage/audio-track/validate-program@1"),
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function assertDuration(value: TemporalDuration, label: string, signed = false): void {
  if (value.unit === "seconds") {
    assert(Number.isSafeInteger(value.numerator) && (signed || value.numerator >= 0)
      && Number.isSafeInteger(value.denominator) && value.denominator > 0, `${label} is invalid.`);
  } else {
    assert(Number.isSafeInteger(value.value) && (signed || value.value >= 0), `${label} is invalid.`);
  }
}

function assertOccupancy(value: AudioOccupancy, label: string): void {
  if (value.mode === "once" || value.mode === "loop") {
    assert(value.align === "start" || value.align === "end", `${label} alignment is invalid.`);
    return;
  }
  assert(value.mode === "stretch" && value.pitch === "preserve"
    && Number.isFinite(value.minRate) && value.minRate > 0
    && Number.isFinite(value.maxRate) && value.maxRate >= value.minRate && value.maxRate <= 100,
  `${label} stretch bounds are invalid.`);
}

export function sealAudioTrackHeader(value: AudioTrackHeader): AudioTrackHeader {
  assertAudioTrackHeader(value);
  return canonicalize(value) as unknown as AudioTrackHeader;
}

export function assertAudioTrackHeader(value: AudioTrackHeader): void {
  assert(value.contract === "svml.audio-track-header@1", "Unsupported AudioTrackHeader contract.");
  assertIdentity(value.id, "AudioTrackHeader.id");
}

export function sealAudioClipSpec(value: AudioClipSpec): AudioClipSpec {
  assertAudioClipSpec(value);
  return canonicalize(value) as unknown as AudioClipSpec;
}

export function assertAudioClipSpec(value: AudioClipSpec): void {
  assert(value.contract === "svml.audio-clip-spec@1", "Unsupported AudioClipSpec contract.");
  assertIdentity(value.id, "AudioClipSpec.id");
  assert(value.expansion.kind === "one" || value.expansion.kind === "each", "AudioClipSpec expansion is invalid.");
  for (const point of [value.projection.start, value.projection.end]) {
    assert(["program.start", "program.end", "selection.start", "selection.end", "moment.cue", "absolute"].includes(point.ref),
      "AudioClipSpec projection point is invalid.");
    if (point.ref === "absolute") assertDuration(point.at, "AudioClipSpec absolute point");
    else if (point.offset !== undefined) assertDuration(point.offset, "AudioClipSpec point offset", true);
  }
  if (value.trim.start !== undefined) assertDuration(value.trim.start, "AudioClipSpec trim start");
  if (value.trim.end !== undefined) assertDuration(value.trim.end, "AudioClipSpec trim end");
  assertOccupancy(value.occupancy, "AudioClipSpec occupancy");
  assert(Number.isFinite(value.mix.gain) && value.mix.gain >= 0 && value.mix.gain <= 64,
    "AudioClipSpec gain is invalid.");
  assertDuration(value.mix.fadeIn, "AudioClipSpec fade in");
  assertDuration(value.mix.fadeOut, "AudioClipSpec fade out");
}

export function createAudioTrackSet(): AudioTrackSet {
  return { contract: "svml.audio-track-set@1", items: [] };
}

export function assertAudioTrackSet(value: AudioTrackSet): void {
  assert(value.contract === "svml.audio-track-set@1" && Array.isArray(value.items), "AudioTrackSet is invalid.");
}

function sourceFacts(media: SynchronizedMedia): AudioItemProgram["source"] {
  verifySynchronizedMedia(media);
  assert(media.audio !== undefined, "Audio Track source has no explicitly normalized audio member.");
  return {
    artifact: structuredClone(media.audio.artifact),
    sampleFrames: synchronizedMediaSampleFrames(media),
  };
}

function realizedItems(
  set: AudioTrackSet,
  header: AudioTrackHeader,
  space: ProgramSpace,
  media: SynchronizedMedia,
  spec: AudioClipSpec,
  occurrences: readonly ProjectedOccurrence[],
): AudioTrackSet {
  assertAudioTrackSet(set);
  assertAudioTrackHeader(header);
  assertProgramSpaceIdentity(space);
  assertAudioClipSpec(spec);
  const source = sourceFacts(media);
  const trimStart = spec.trim.start === undefined ? 0 : temporalDurationInSamples(spec.trim.start, space);
  const trimEnd = spec.trim.end === undefined ? source.sampleFrames : temporalDurationInSamples(spec.trim.end, space);
  assert(trimStart >= 0 && trimStart < source.sampleFrames, `Audio Clip ${spec.id} trim start is outside its source.`);
  assert(trimEnd > trimStart && trimEnd <= source.sampleFrames, `Audio Clip ${spec.id} trim end is outside its source.`);
  const fadeInSamples = temporalDurationInSamples(spec.mix.fadeIn, space);
  const fadeOutSamples = temporalDurationInSamples(spec.mix.fadeOut, space);
  const additions = occurrences.map((occurrence) => ({
    id: occurrence.id,
    window: { ...occurrence.span },
    source: structuredClone(source),
    trim: { startSample: trimStart, endSampleExclusive: trimEnd },
    occupancy: structuredClone(spec.occupancy),
    mix: { gain: spec.mix.gain, fadeInSamples, fadeOutSamples },
  } satisfies AudioItemProgram));
  const ids = new Set(set.items.map((item) => item.id));
  for (const item of additions) {
    assert(!ids.has(item.id), `Audio Track ${header.id} already contains Item ${item.id}.`);
    ids.add(item.id);
  }
  return { contract: "svml.audio-track-set@1", items: [...set.items, ...additions] };
}

export function appendProgramAudioItem(
  set: AudioTrackSet,
  header: AudioTrackHeader,
  space: ProgramSpace,
  media: SynchronizedMedia,
  spec: AudioClipSpec,
): AudioTrackSet {
  assert(spec.expansion.kind === "one", `Program Audio Clip ${spec.id} must use one occurrence.`);
  return realizedItems(set, header, space, media, spec, [projectProgramWindow({
    itemId: spec.id,
    space,
    projection: spec.projection,
  })]);
}

export function appendSelectionAudioItem(
  set: AudioTrackSet,
  header: AudioTrackHeader,
  space: ProgramSpace,
  media: SynchronizedMedia,
  map: CompleteSemanticMap,
  selection: NarrativeSelectionRef,
  spec: AudioClipSpec,
): AudioTrackSet {
  return realizedItems(set, header, space, media, spec, projectSelectionWindows({
    itemId: spec.id, map, selection, space, expansion: spec.expansion, projection: spec.projection,
  }));
}

export function appendMomentAudioItem(
  set: AudioTrackSet,
  header: AudioTrackHeader,
  space: ProgramSpace,
  media: SynchronizedMedia,
  map: CompleteSemanticMap,
  moment: NarrativeMomentRef,
  spec: AudioClipSpec,
): AudioTrackSet {
  return realizedItems(set, header, space, media, spec, projectMomentWindows({
    itemId: spec.id, map, moment, space, expansion: spec.expansion, projection: spec.projection,
  }));
}

function normalizeProgram(value: AudioTrackProgram): AudioTrackProgram {
  return {
    contract: "svml.audio-track-program@1",
    id: value.id,
    items: [...value.items].map((item) => structuredClone(item)).sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function sealAudioTrackProgram(value: AudioTrackProgram): AudioTrackProgram {
  const normalized = normalizeProgram(value);
  assertAudioTrackProgram(normalized);
  return canonicalize(normalized) as unknown as AudioTrackProgram;
}

export function finalizeAudioTrack(set: AudioTrackSet, header: AudioTrackHeader): AudioTrackProgram {
  assertAudioTrackSet(set);
  assertAudioTrackHeader(header);
  assert(set.items.length > 0, "Audio Track requires at least one Item.");
  return sealAudioTrackProgram({ contract: "svml.audio-track-program@1", id: header.id, items: set.items });
}

export function assertAudioTrackProgram(value: AudioTrackProgram): void {
  assert(value.contract === "svml.audio-track-program@1", "Unsupported AudioTrackProgram contract.");
  assertIdentity(value.id, "AudioTrackProgram.id");
  assert(value.items.length > 0, "AudioTrackProgram requires at least one Item.");
  const ids = new Set<string>();
  for (const item of value.items) {
    assertIdentity(item.id, "AudioItemProgram.id");
    assert(!ids.has(item.id), `AudioTrackProgram contains duplicate Item ${item.id}.`);
    ids.add(item.id);
    assert(Number.isSafeInteger(item.window.startFrame) && item.window.startFrame >= 0
      && Number.isSafeInteger(item.window.endFrameExclusive)
      && item.window.endFrameExclusive > item.window.startFrame, `Audio Item ${item.id} window is invalid.`);
    assert(isDigest(item.source.artifact.digest) && item.source.artifact.mediaType === "audio/wav"
      && Number.isSafeInteger(item.source.sampleFrames) && item.source.sampleFrames > 0,
    `Audio Item ${item.id} source is invalid.`);
    assert(item.trim.startSample >= 0 && item.trim.endSampleExclusive > item.trim.startSample
      && item.trim.endSampleExclusive <= item.source.sampleFrames, `Audio Item ${item.id} trim is invalid.`);
    assertOccupancy(item.occupancy, `Audio Item ${item.id} occupancy`);
    assert(Number.isFinite(item.mix.gain) && item.mix.gain >= 0 && item.mix.gain <= 64
      && Number.isSafeInteger(item.mix.fadeInSamples) && item.mix.fadeInSamples >= 0
      && Number.isSafeInteger(item.mix.fadeOutSamples) && item.mix.fadeOutSamples >= 0,
    `Audio Item ${item.id} mix is invalid.`);
  }
}

function terminalClip(item: AudioItemProgram, space: ProgramSpace): AudioClip {
  const windowStart = programFrameSampleBoundary(space, item.window.startFrame, 48_000);
  const windowEnd = programFrameSampleBoundary(space, item.window.endFrameExclusive, 48_000);
  const windowLength = windowEnd - windowStart;
  const effectiveLength = item.trim.endSampleExclusive - item.trim.startSample;
  let targetStart = windowStart;
  let targetEnd = windowEnd;
  let sourceStart = item.trim.startSample;
  let sourceEnd = item.trim.endSampleExclusive;
  let loop = false;
  let phaseSample = 0;
  let playbackRate = 1;
  if (item.occupancy.mode === "once") {
    const audibleLength = Math.min(windowLength, effectiveLength);
    if (item.occupancy.align === "start") {
      targetEnd = targetStart + audibleLength;
      sourceEnd = sourceStart + audibleLength;
    } else {
      targetStart = targetEnd - audibleLength;
      sourceStart = sourceEnd - audibleLength;
    }
  } else if (item.occupancy.mode === "loop") {
    loop = true;
    phaseSample = item.occupancy.align === "start"
      ? 0
      : (effectiveLength - (windowLength % effectiveLength)) % effectiveLength;
  } else {
    playbackRate = effectiveLength / windowLength;
    assert(playbackRate >= item.occupancy.minRate && playbackRate <= item.occupancy.maxRate,
      `Audio Item ${item.id} requires playback rate ${playbackRate}, outside authored bounds.`);
  }
  const audibleLength = targetEnd - targetStart;
  assert(item.mix.fadeInSamples <= audibleLength && item.mix.fadeOutSamples <= audibleLength,
    `Audio Item ${item.id} fade exceeds its audible interval.`);
  return {
    id: item.id,
    artifact: structuredClone(item.source.artifact),
    target: { startSample: targetStart, endSampleExclusive: targetEnd },
    source: {
      sampleFrames: item.source.sampleFrames,
      startSample: sourceStart,
      endSampleExclusive: sourceEnd,
      loop,
      phaseSample,
    },
    playbackRate,
    pitch: "preserve",
    gain: item.mix.gain,
    fadeInSamples: item.mix.fadeInSamples,
    fadeOutSamples: item.mix.fadeOutSamples,
  };
}

export function renderAudioTrack(space: ProgramSpace, program: AudioTrackProgram): AudioTrack {
  assertProgramSpaceIdentity(space);
  assertAudioTrackProgram(program);
  const totalSamples = programSpaceSampleFrames(space, 48_000);
  const track = sealAudioTrack({
    contract: "svml.audio-track@1",
    id: program.id,
    clips: program.items.map((item) => terminalClip(item, space)),
  });
  for (const clip of track.clips) {
    assert(clip.target.endSampleExclusive <= totalSamples, `Audio Clip ${clip.id} is outside ProgramSpace.`);
  }
  assertAudioTrackIdentity(track, space);
  return track;
}
