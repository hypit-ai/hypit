import { assertTimelineIdentity, timelineFrameSampleBoundary, timelineSampleFrames } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import { assertAudioTrackIdentity, sealAudioTrack } from "@hypit/composition";
import type { AudioClip, AudioTrack } from "@hypit/composition";
import { synchronizedMediaSampleFrames, verifySynchronizedMedia } from "@hypit/media";
import type { SynchronizedMedia } from "@hypit/media";
import { canonicalize, isResourceId } from "@hypit/hypit/protocol";
import { assertTemporalWindowFor, temporalDurationInSamples } from "@hypit/temporal";
import type { TemporalWindow, TemporalDuration } from "@hypit/temporal";

import type {
  AudioClipSpec,
  AudioClipProgram,
  AudioTrackHeader,
  AudioTrackProgram,
  AudioTrackSet,
} from "./types.js";
import { assertAudioSourceTimeSpec, defaultAudioSourceTimeSpec, resolveAudioSourceTime } from "./source-time.js";

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
  assertIdentity(value.id, "AudioTrackHeader.id");
}

export function sealAudioClipSpec(value: AudioClipSpec): AudioClipSpec {
  assertAudioClipSpec(value);
  return canonicalize(value) as unknown as AudioClipSpec;
}

export function assertAudioClipSpec(value: AudioClipSpec): void {
  assertIdentity(value.id, "AudioClipSpec.id");
  if (value.sourceTime !== undefined) assertAudioSourceTimeSpec(value.sourceTime, "AudioClipSpec.sourceTime");
  assert(Number.isFinite(value.mix.gain) && value.mix.gain >= 0 && value.mix.gain <= 64,
    "AudioClipSpec gain is invalid.");
  assertDuration(value.mix.fadeIn, "AudioClipSpec fade in");
  assertDuration(value.mix.fadeOut, "AudioClipSpec fade out");
}

export function createAudioTrackSet(): AudioTrackSet {
  return { clips: [] };
}

export function assertAudioTrackSet(value: AudioTrackSet): void {
  assert(Array.isArray(value.clips), "AudioTrackSet is invalid.");
}

function sourceFacts(media: SynchronizedMedia): AudioClipProgram["source"] {
  verifySynchronizedMedia(media);
  assert(media.audio !== undefined, "Audio Track source has no explicitly normalized audio member.");
  return {
    artifact: structuredClone(media.audio.artifact),
    sampleFrames: synchronizedMediaSampleFrames(media),
  };
}

function realizedClips(
  set: AudioTrackSet,
  header: AudioTrackHeader,
  timeline: Timeline,
  media: SynchronizedMedia,
  spec: AudioClipSpec,
  window: TemporalWindow,
): AudioTrackSet {
  assertAudioTrackSet(set);
  assertAudioTrackHeader(header);
  assertTimelineIdentity(timeline);
  assertAudioClipSpec(spec);
  assertTemporalWindowFor(window, { subjectId: spec.id, timeline: timeline });
  const source = sourceFacts(media);
  const fadeInSamples = fadeSamples(spec.mix.fadeIn, timeline, window.span.startFrame, 1);
  const fadeOutSamples = fadeSamples(spec.mix.fadeOut, timeline, window.span.endFrameExclusive, -1);
  const addition = {
    id: window.id,
    subjectId: spec.id,
    window: { ...window.span },
    source: structuredClone(source),
    sourceTime: structuredClone(spec.sourceTime ?? defaultAudioSourceTimeSpec()),
    mix: { gain: spec.mix.gain, fadeInSamples, fadeOutSamples },
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
  media: SynchronizedMedia,
  spec: AudioClipSpec,
  window: TemporalWindow,
): AudioTrackSet {
  return realizedClips(set, header, timeline, media, spec, window);
}

function normalizeProgram(value: AudioTrackProgram): AudioTrackProgram {
  return {

    id: value.id,
    clips: [...value.clips].map((clip) => structuredClone(clip)).sort((left, right) => left.id.localeCompare(right.id)),
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
  assertIdentity(value.id, "AudioTrackProgram.id");
  assert(value.clips.length > 0, "AudioTrackProgram requires at least one Clip.");
  const ids = new Set<string>();
  for (const clip of value.clips) {
    assertIdentity(clip.id, "AudioClipProgram.id");
    assertIdentity(clip.subjectId, "AudioClipProgram.subjectId");
    assert(!ids.has(clip.id), `AudioTrackProgram contains duplicate Clip ${clip.id}.`);
    ids.add(clip.id);
    assert(Number.isSafeInteger(clip.window.startFrame) && clip.window.startFrame >= 0
      && Number.isSafeInteger(clip.window.endFrameExclusive)
      && clip.window.endFrameExclusive > clip.window.startFrame, `Audio Clip ${clip.id} window is invalid.`);
    assert(isResourceId(clip.source.artifact.resource) && clip.source.artifact.mediaType === "audio/wav"
      && Number.isSafeInteger(clip.source.sampleFrames) && clip.source.sampleFrames > 0,
    `Audio Clip ${clip.id} source is invalid.`);
    assertAudioSourceTimeSpec(clip.sourceTime, `Audio Clip ${clip.id} source time`);
    assert(Number.isFinite(clip.mix.gain) && clip.mix.gain >= 0 && clip.mix.gain <= 64
      && Number.isSafeInteger(clip.mix.fadeInSamples) && clip.mix.fadeInSamples >= 0
      && Number.isSafeInteger(clip.mix.fadeOutSamples) && clip.mix.fadeOutSamples >= 0,
    `Audio Clip ${clip.id} mix is invalid.`);
  }
}

/**
 * A fade in frames spans whole frames from the Window edge it starts at. Converting it as a free
 * duration can round one sample longer than the same frames inside the Window at 30000/1001.
 */
function fadeSamples(duration: TemporalDuration, timeline: Timeline, edgeFrame: number, direction: 1 | -1): number {
  const otherFrame = duration.unit === "frames" ? edgeFrame + direction * duration.value : undefined;
  if (otherFrame === undefined || otherFrame < 0 || otherFrame > timeline.frameCount) {
    return temporalDurationInSamples(duration, timeline);
  }
  return Math.abs(timelineFrameSampleBoundary(timeline, otherFrame, 48_000)
    - timelineFrameSampleBoundary(timeline, edgeFrame, 48_000));
}

function terminalClip(clip: AudioClipProgram, timeline: Timeline): AudioClip {
  const windowStart = timelineFrameSampleBoundary(timeline, clip.window.startFrame, 48_000);
  const windowEnd = timelineFrameSampleBoundary(timeline, clip.window.endFrameExclusive, 48_000);
  const windowLength = windowEnd - windowStart;
  assert(clip.mix.fadeInSamples <= windowLength && clip.mix.fadeOutSamples <= windowLength,
    `Audio Clip ${clip.id} fade exceeds its Window.`);
  return {
    id: clip.id,
    subjectId: clip.subjectId,
    artifact: structuredClone(clip.source.artifact),
    target: { startSample: windowStart, endSampleExclusive: windowEnd },
    sourceTime: resolveAudioSourceTime({
      timeline,
      sourceSampleFrames: clip.source.sampleFrames,
      targetSampleFrames: windowLength,
      spec: clip.sourceTime,
    }),
    gain: clip.mix.gain,
    fadeInSamples: clip.mix.fadeInSamples,
    fadeOutSamples: clip.mix.fadeOutSamples,
  };
}

export function renderAudioTrack(timeline: Timeline, program: AudioTrackProgram): AudioTrack {
  assertTimelineIdentity(timeline);
  assertAudioTrackProgram(program);
  const totalSamples = timelineSampleFrames(timeline, 48_000);
  const track = sealAudioTrack({
    timelineId: timeline.id,
    id: program.id,
    clips: program.clips.map((clip) => terminalClip(clip, timeline)),
  });
  for (const clip of track.clips) {
    assert(clip.target.endSampleExclusive <= totalSamples, `Audio Clip ${clip.id} is outside Timeline.`);
  }
  assertAudioTrackIdentity(track, timeline);
  return track;
}
