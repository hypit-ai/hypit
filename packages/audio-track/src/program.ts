import { assertFrameSpan, assertTimelineIdentity } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import { assertAudioReconstructionProgram, assertAudioTrackIdentity, audioGraphFromClips, sealAudioTrack } from "@hypit/composition";
import type { AudioClip, AudioTrack } from "@hypit/composition";
import { preparedAudioSource, verifyPreparedMedia } from "@hypit/media";
import type { PreparedMedia } from "@hypit/media";
import { canonicalize, compareCodeUnits } from "@hypit/hypit/protocol";
import {
  assertTemporalMap,
  assertTemporalRelationSpec,
  assertTemporalWindowFor,
  compareExactTemporalValues,
  exactTemporalValueFromDuration,
  exactTemporalValueFromFrames,
  resolveTemporalRelation,
  sealLocalTemporalDomain,
  subtractExactTemporalValues,
} from "@hypit/temporal";
import type { TemporalWindow, TemporalDuration, TemporalRelationSpec } from "@hypit/temporal";

import type {
  AudioClipSpec,
  AudioClipProgram,
  AudioTrackHeader,
  AudioTrackProgram,
  AudioTrackSet,
} from "./types.js";

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

export function sealAudioTrackHeader(value: AudioTrackHeader): AudioTrackHeader {
  assertAudioTrackHeader(value);
  return canonicalize(value) as unknown as AudioTrackHeader;
}

export function assertAudioTrackHeader(value: AudioTrackHeader): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "AudioTrackHeader is invalid.");
  assertIdentity(value.id, "AudioTrackHeader.id");
}

export function sealAudioClipSpec(value: AudioClipSpec): AudioClipSpec {
  assertAudioClipSpec(value);
  return canonicalize(value) as unknown as AudioClipSpec;
}

export function assertAudioClipSpec(value: AudioClipSpec): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "AudioClipSpec is invalid.");
  assertIdentity(value.id, "AudioClipSpec.id");
  if (value.sampling !== undefined) assertAudioSampling(value.sampling, "AudioClipSpec.sampling");
  if (value.reconstruction !== undefined) {
    assertAudioReconstructionProgram(value.reconstruction, "AudioClipSpec.reconstruction");
  }
  assert(value.mix !== null && typeof value.mix === "object" && !Array.isArray(value.mix),
    "AudioClipSpec.mix is invalid.");
  assert(Number.isFinite(value.mix.gain) && value.mix.gain >= 0,
    "AudioClipSpec gain is invalid.");
  assertDuration(value.mix.fadeIn, "AudioClipSpec fade in");
  assertDuration(value.mix.fadeOut, "AudioClipSpec fade out");
}

function assertAudioSampling(value: TemporalRelationSpec, label: string): void {
  assertTemporalRelationSpec(value, label);
}

export function createAudioTrackSet(): AudioTrackSet {
  return { clips: [] };
}

export function assertAudioTrackSet(value: AudioTrackSet): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value)
    && Array.isArray(value.clips), "AudioTrackSet is invalid.");
  const ids = new Set<string>();
  for (const [index, clip] of value.clips.entries()) {
    assertAudioClipProgram(clip, `AudioTrackSet.clips.${index}`);
    assert(!ids.has(clip.id), `AudioTrackSet contains duplicate Clip ${clip.id}.`);
    ids.add(clip.id);
  }
}

function sourceFacts(media: PreparedMedia): AudioClipProgram["source"] {
  verifyPreparedMedia(media);
  assert(media.audio !== undefined, "Prepared Media source has no audio member.");
  return { media: structuredClone(media) };
}

function realizedClips(
  set: AudioTrackSet,
  header: AudioTrackHeader,
  timeline: Timeline,
  media: PreparedMedia,
  spec: AudioClipSpec,
  window: TemporalWindow,
): AudioTrackSet {
  assertAudioTrackSet(set);
  assertAudioTrackHeader(header);
  assertTimelineIdentity(timeline);
  assertAudioClipSpec(spec);
  assertTemporalWindowFor(window, { timeline });
  const source = sourceFacts(media);
  const fadeIn = exactTemporalValueFromDuration(spec.mix.fadeIn, timeline);
  const fadeOut = exactTemporalValueFromDuration(spec.mix.fadeOut, timeline);
  const addition = {
    id: spec.id,
    subjectId: spec.id,
    window: { ...window.span },
    source: structuredClone(source),
    sampling: resolveTemporalRelation({
      target: sealLocalTemporalDomain({
        id: `${spec.id}:occurrence`,
        duration: exactTemporalValueFromFrames(window.span.endFrameExclusive - window.span.startFrame, timeline),
      }),
      source: media.domain,
      clock: timeline,
      ...(spec.sampling === undefined ? {} : { spec: spec.sampling }),
    }),
    ...(spec.reconstruction === undefined ? {} : { reconstruction: structuredClone(spec.reconstruction) }),
    mix: { gain: spec.mix.gain, fadeIn, fadeOut },
  } satisfies AudioClipProgram;
  const ids = new Set(set.clips.map((clip) => clip.id));
  assert(!ids.has(addition.id), `Audio Track ${header.id} already contains Clip ${addition.id}.`);
  return { clips: [...set.clips, addition] };
}

/** Component entry point: the Temporal module has already resolved the target window. */
export function appendAudioClip(
  set: AudioTrackSet,
  header: AudioTrackHeader,
  timeline: Timeline,
  media: PreparedMedia,
  spec: AudioClipSpec,
  window: TemporalWindow,
): AudioTrackSet {
  return realizedClips(set, header, timeline, media, spec, window);
}

function normalizeProgram(value: AudioTrackProgram): AudioTrackProgram {
  return {

    id: value.id,
    clips: [...value.clips].map((clip) => structuredClone(clip)).sort((left, right) => compareCodeUnits(left.id, right.id)),
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
  assert(set.clips.length > 0, "Audio Track requires at least one Clip.");
  return sealAudioTrackProgram({ id: header.id, clips: set.clips });
}

export function assertAudioTrackProgram(value: AudioTrackProgram): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value)
    && Array.isArray(value.clips), "AudioTrackProgram is invalid.");
  assertIdentity(value.id, "AudioTrackProgram.id");
  assert(value.clips.length > 0, "AudioTrackProgram requires at least one Clip.");
  const ids = new Set<string>();
  for (const [index, clip] of value.clips.entries()) {
    assertAudioClipProgram(clip, `AudioTrackProgram.clips.${index}`);
    assert(!ids.has(clip.id), `AudioTrackProgram contains duplicate Clip ${clip.id}.`);
    ids.add(clip.id);
  }
}

function assertAudioClipProgram(clip: AudioClipProgram, label: string): void {
    assert(clip !== null && typeof clip === "object" && !Array.isArray(clip), `${label} is invalid.`);
    assertIdentity(clip.id, `${label}.id`);
    assertIdentity(clip.subjectId, `${label}.subjectId`);
    try {
      assertFrameSpan(clip.window);
    } catch {
      throw new Error(`Audio Clip ${clip.id} window is invalid.`);
    }
    assert(clip.source !== null && typeof clip.source === "object" && !Array.isArray(clip.source),
      `${label}.source is invalid.`);
    verifyPreparedMedia(clip.source.media);
    assertTemporalMap(clip.sampling);
    if (clip.reconstruction !== undefined) {
      assertAudioReconstructionProgram(clip.reconstruction, `${label}.reconstruction`);
    }
    assert(clip.sampling.stages.at(-1)?.source.id === clip.source.media.domain.id,
      `Audio Clip ${clip.id} source Map does not end at its PreparedMedia domain.`);
    assert(clip.mix !== null && typeof clip.mix === "object" && !Array.isArray(clip.mix),
      `${label}.mix is invalid.`);
    assert(Number.isFinite(clip.mix.gain) && clip.mix.gain >= 0
      && compareExactTemporalValues(clip.mix.fadeIn, { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }) >= 0
      && compareExactTemporalValues(clip.mix.fadeOut, { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }) >= 0,
    `Audio Clip ${clip.id} mix is invalid.`);
}

function terminalClip(clip: AudioClipProgram, timeline: Timeline): AudioClip {
  const target = {
    start: exactTemporalValueFromFrames(clip.window.startFrame, timeline),
    end: exactTemporalValueFromFrames(clip.window.endFrameExclusive, timeline),
  };
  const windowDuration = subtractExactTemporalValues(target.end, target.start);
  assert(compareExactTemporalValues(clip.mix.fadeIn, windowDuration) <= 0
    && compareExactTemporalValues(clip.mix.fadeOut, windowDuration) <= 0,
    `Audio Clip ${clip.id} fade exceeds its Window.`);
  return {
    id: clip.id,
    subjectId: clip.subjectId,
    source: preparedAudioSource(clip.source.media),
    preparation: structuredClone(clip.source.media.audio!.map),
    target,
    sampling: structuredClone(clip.sampling),
    ...(clip.reconstruction === undefined ? {} : { reconstruction: structuredClone(clip.reconstruction) }),
    gain: clip.mix.gain,
    fadeIn: structuredClone(clip.mix.fadeIn),
    fadeOut: structuredClone(clip.mix.fadeOut),
  };
}

export function renderAudioTrack(timeline: Timeline, program: AudioTrackProgram): AudioTrack {
  assertTimelineIdentity(timeline);
  assertAudioTrackProgram(program);
  const track = sealAudioTrack({
    timelineId: timeline.id,
    id: program.id,
    graph: audioGraphFromClips(program.clips.map((clip) => terminalClip(clip, timeline))),
  });
  assertAudioTrackIdentity(track, timeline);
  return track;
}
