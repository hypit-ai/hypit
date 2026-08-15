import type { NarrativeExcerpt } from "@narratage/narrative";
import { synchronizedMediaSampleFrames, verifySynchronizedMedia, verifyTimelineAudio } from "@narratage/media";
import type { SynchronizedMedia, TimelineAudio } from "@narratage/media";
import { assertProgramSpaceIdentity, sealProgramSpace } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { sealSpeechBasis } from "@narratage/speech";
import type { SpeechBasis } from "@narratage/speech";
import {
  sealAudioProgramPlan,
  verifyAudioProgramPlan,
} from "@narratage/media-pipeline";
import type { AudioProgramPlan } from "@narratage/media-pipeline";
import { canonicalize, digestOf } from "@narratage/protocol";
import { assertContentFit, assertSpatialFrame } from "@narratage/spatial";
import type { ContentFit, SpatialFrame } from "@narratage/spatial";

import type {
  SpeechSpineProgram,
  SpeechSpineSet,
  SpeechSpineTake,
  SpeechSpineVisualSpec,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function programContent(value: SpeechSpineProgram): SpeechSpineProgram {
  return {

    id: value.id,
    frameRate: { ...value.frameRate },
  };
}

export function sealSpeechSpineProgram(value: SpeechSpineProgram): SpeechSpineProgram {
  return programContent(value);
}

export function assertSpeechSpineProgram(value: SpeechSpineProgram): void {
  assert(value.id.trim().length > 0, "SpeechSpineProgram id must not be empty");
  assert(Number.isSafeInteger(value.frameRate.numerator) && value.frameRate.numerator > 0
    && Number.isSafeInteger(value.frameRate.denominator) && value.frameRate.denominator > 0,
  "SpeechSpineProgram frame rate is invalid");
}

function verifyExcerpt(value: NarrativeExcerpt): void {
  assert(value.kind === "segment",
    "Speech Spine Take must reference a Segment NarrativeExcerpt");
  assert(value.id.length > 0 && Number.isSafeInteger(value.tokenStart)
    && Number.isSafeInteger(value.tokenEndExclusive) && value.tokenEndExclusive > value.tokenStart,
  "Speech Spine Segment excerpt is invalid");
}

function setContent(value: SpeechSpineSet): SpeechSpineSet {
  return canonicalize({

    takes: value.takes,
  }) as unknown as SpeechSpineSet;
}

function sealSpeechSpineSet(value: SpeechSpineSet): SpeechSpineSet {
  return setContent(value);
}

function assertTake(take: SpeechSpineTake, program: SpeechSpineProgram): void {
  verifyExcerpt(take.segment);
  verifySynchronizedMedia(take.media);
  assert(take.media.audio !== undefined, `Speech Segment ${take.segment.id} has no speech audio`);
  assert(take.media.timeline.frameRate.numerator === program.frameRate.numerator
    && take.media.timeline.frameRate.denominator === program.frameRate.denominator,
  `Speech Segment ${take.segment.id} uses another frame rate`);
  assert((take.media.visual === undefined) === (take.visual === undefined),
    `Speech Segment ${take.segment.id} visual policy does not match its media`);
  if (take.visual !== undefined) {
    assertSpatialFrame(take.visual.frame);
    assertContentFit(take.visual.fit);
    assert(Number.isSafeInteger(take.visual.stackingOrder),
      `Speech Segment ${take.segment.id} visual stacking order is invalid`);
  }
}

export function sealSpeechSpineVisualSpec(value: SpeechSpineVisualSpec): SpeechSpineVisualSpec {
  const result = structuredClone(value);
  assertSpeechSpineVisualSpec(result);
  return result;
}

export function assertSpeechSpineVisualSpec(value: SpeechSpineVisualSpec): void {
  assert(Number.isSafeInteger(value.stackingOrder), "SpeechSpineVisualSpec stacking order is invalid");
}

export function assertSpeechSpineSet(value: SpeechSpineSet): void {
  const segments = new Set<string>();
  for (const take of value.takes) {
    verifyExcerpt(take.segment);
    verifySynchronizedMedia(take.media);
    assert(!segments.has(take.segment.id), `Speech Spine repeats Segment ${take.segment.id}`);
    segments.add(take.segment.id);
  }
}

export function createSpeechSpineSet(): SpeechSpineSet {
  return sealSpeechSpineSet({

    takes: [],
  });
}

function appendTake(
  set: SpeechSpineSet,
  program: SpeechSpineProgram,
  take: SpeechSpineTake,
): SpeechSpineSet {
  assertSpeechSpineSet(set);
  assertSpeechSpineProgram(program);
  assertTake(take, program);
  assert(!set.takes.some((item) => item.segment.id === take.segment.id), `Speech Spine repeats Segment ${take.segment.id}`);
  return sealSpeechSpineSet({

    takes: [...set.takes, take],
  });
}

export function appendSpeechSpineAudioTake(
  set: SpeechSpineSet,
  program: SpeechSpineProgram,
  media: SynchronizedMedia,
  segment: NarrativeExcerpt,
): SpeechSpineSet {
  verifySynchronizedMedia(media);
  assert(media.visual === undefined, `Speech Segment ${segment.id} audio Take unexpectedly contains a visual stream`);
  return appendTake(set, program, { media, segment });
}

export function appendSpeechSpineVisualTake(
  set: SpeechSpineSet,
  program: SpeechSpineProgram,
  media: SynchronizedMedia,
  segment: NarrativeExcerpt,
  frame: SpatialFrame,
  fit: ContentFit,
  visualSpec: SpeechSpineVisualSpec,
): SpeechSpineSet {
  assertSpatialFrame(frame);
  assertContentFit(fit);
  assertSpeechSpineVisualSpec(visualSpec);
  verifySynchronizedMedia(media);
  assert(media.visual !== undefined, `Speech Segment ${segment.id} visual Take has no visual stream`);
  const take = {
    media,
    segment,
    visual: {
      frame: structuredClone(frame),
      fit: structuredClone(fit),
      stackingOrder: visualSpec.stackingOrder,
    },
  } satisfies SpeechSpineTake;
  return appendTake(set, program, take);
}

function frameSample(frame: number, frameRate: SpeechSpineProgram["frameRate"]): number {
  const numerator = BigInt(frame) * 48_000n * BigInt(frameRate.denominator);
  const denominator = BigInt(frameRate.numerator);
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  assert(rounded <= BigInt(Number.MAX_SAFE_INTEGER), "Speech Spine sample boundary exceeds safe arithmetic");
  return Number(rounded);
}

function programSpace(program: SpeechSpineProgram, set: SpeechSpineSet): ProgramSpace {
  assertSpeechSpineProgram(program);
  assertSpeechSpineSet(set);
  assert(set.takes.length > 0, "Speech Spine must contain at least one Take");
  for (const take of set.takes) assertTake(take, program);
  const frameCount = set.takes.reduce((sum, take) => sum + take.media.timeline.frameCount, 0);
  const space = sealProgramSpace({
    durationSec: frameCount * program.frameRate.denominator / program.frameRate.numerator,
    frameRate: { ...program.frameRate },
  });
  assertProgramSpaceIdentity(space);
  return space;
}

export function compileSpeechSpineAudio(program: SpeechSpineProgram, set: SpeechSpineSet): AudioProgramPlan {
  const space = programSpace(program, set);
  let frame = 0;
  const clips = set.takes.map((take, index) => {
    const audio = take.media.audio!;
    const startFrame = frame;
    frame += take.media.timeline.frameCount;
    const targetStartSample = frameSample(startFrame, program.frameRate);
    const targetEndSampleExclusive = frameSample(frame, program.frameRate);
    const sourceSampleFrames = synchronizedMediaSampleFrames(take.media);
    assert(targetEndSampleExclusive - targetStartSample === sourceSampleFrames,
      `Speech Segment ${take.segment.id} audio does not exactly cover its normalized frame span`);
    return {
      id: `${String(index + 1).padStart(4, "0")}:${take.segment.id}`,
      artifact: audio.artifact,
      targetStartSample,
      targetEndSampleExclusive,
      sourceSampleFrames,
      sourceStartSample: 0,
      sourceEndSampleExclusive: sourceSampleFrames,
      sourceLoop: false,
      sourcePhaseSample: 0,
      playbackRate: 1,
      pitch: "preserve" as const,
      gain: 1,
      fadeInSamples: 0,
      fadeOutSamples: 0,
    };
  });
  const plan = sealAudioProgramPlan({
    frameRate: { ...space.frameRate },
    frameCount: frame,
    sampleRate: 48_000,
    sampleFrames: frameSample(frame, program.frameRate),
    clips,
    mix: { normalize: false, limiter: "none" },
  });
  verifyAudioProgramPlan(plan);
  return plan;
}

export function assembleSpeechBasis(
  program: SpeechSpineProgram,
  set: SpeechSpineSet,
  audio: TimelineAudio,
): SpeechBasis {
  const space = programSpace(program, set);
  verifyTimelineAudio(audio);
  assert(audio.sampleFrames === frameSample(
    set.takes.reduce((sum, take) => sum + take.media.timeline.frameCount, 0),
    program.frameRate,
  ), "TimelineAudio does not cover this Speech Spine");
  let frame = 0;
  const segments = set.takes.map((take) => {
    const startFrame = frame;
    frame += take.media.timeline.frameCount;
    return { segmentId: take.segment.id, startFrame, endFrameExclusive: frame };
  });
  frame = 0;
  const visualClips = set.takes.flatMap((take) => {
    frame += take.media.timeline.frameCount;
    if (take.media.visual === undefined || take.visual === undefined) return [];
    return [{
      segmentId: take.segment.id,
      artifact: structuredClone(take.media.visual.artifact),
      extent: {
        widthPx: take.media.visual.width,
        heightPx: take.media.visual.height,
      },
      frame: structuredClone(take.visual.frame),
      fit: structuredClone(take.visual.fit),
      stackingOrder: take.visual.stackingOrder,
    }];
  });
  return sealSpeechBasis({
    programSpace: space,
    audio: structuredClone(audio.artifact),
    visualTrack: { clips: visualClips },
    segments,
  });
}
