import type { NarrativeExcerpt } from "@narratage/narrative";
import { verifySynchronizedMedia, verifyTimelineAudio } from "@narratage/media";
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

import type {
  SpeechSpineProgram,
  SpeechSpineSet,
  SpeechSpineTake,
} from "./types.js";

export const createSpeechSpineSetImplementationDigest = digestOf("@narratage/speech-spine/create-spine-set@1");
export const appendSpeechSpineTakeImplementationDigest = digestOf("@narratage/speech-spine/append-spine-take@1");
export const compileSpeechSpineAudioImplementationDigest = digestOf("@narratage/speech-spine/compile-spine-audio@1");
export const assembleSpeechBasisImplementationDigest = digestOf("@narratage/speech-spine/assemble-speech-basis@1");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function programContent(value: SpeechSpineProgram): SpeechSpineProgram {
  return {
    contract: "svml.speech-spine-program@1",
    id: value.id,
    frameRate: { ...value.frameRate },
  };
}

export function sealSpeechSpineProgram(value: SpeechSpineProgram): SpeechSpineProgram {
  return programContent(value);
}

export function assertSpeechSpineProgram(value: SpeechSpineProgram): void {
  assert(value.contract === "svml.speech-spine-program@1", "Unsupported SpeechSpineProgram contract");
  assert(value.id.trim().length > 0, "SpeechSpineProgram id must not be empty");
  assert(Number.isSafeInteger(value.frameRate.numerator) && value.frameRate.numerator > 0
    && Number.isSafeInteger(value.frameRate.denominator) && value.frameRate.denominator > 0,
  "SpeechSpineProgram frame rate is invalid");
}

function verifyExcerpt(value: NarrativeExcerpt): void {
  assert(value.contract === "svml.narrative-excerpt@1" && value.kind === "segment",
    "Speech Spine Take must reference a Segment NarrativeExcerpt");
  assert(value.id.length > 0 && Number.isSafeInteger(value.tokenStart)
    && Number.isSafeInteger(value.tokenEndExclusive) && value.tokenEndExclusive > value.tokenStart,
  "Speech Spine Segment excerpt is invalid");
}

function setContent(value: SpeechSpineSet): SpeechSpineSet {
  return canonicalize({
    contract: "svml.speech-spine-set@1",
    takes: value.takes,
  }) as unknown as SpeechSpineSet;
}

function sealSpeechSpineSet(value: SpeechSpineSet): SpeechSpineSet {
  return setContent(value);
}

function assertTake(take: SpeechSpineTake, program: SpeechSpineProgram): void {
  verifyExcerpt(take.segment);
  verifySynchronizedMedia(take.media);
  assert(take.media.visual !== undefined, `Speech Segment ${take.segment.id} has no moving visual`);
  assert(take.media.audio !== undefined, `Speech Segment ${take.segment.id} has no speech audio`);
  assert(take.media.timeline.frameRate.numerator === program.frameRate.numerator
    && take.media.timeline.frameRate.denominator === program.frameRate.denominator,
  `Speech Segment ${take.segment.id} uses another frame rate`);
}

export function assertSpeechSpineSet(value: SpeechSpineSet): void {
  assert(value.contract === "svml.speech-spine-set@1", "Unsupported SpeechSpineSet contract");
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
    contract: "svml.speech-spine-set@1",
    takes: [],
  });
}

export function appendSpeechSpineTake(
  set: SpeechSpineSet,
  program: SpeechSpineProgram,
  media: SynchronizedMedia,
  segment: NarrativeExcerpt,
): SpeechSpineSet {
  assertSpeechSpineSet(set);
  assertSpeechSpineProgram(program);
  const take = { media, segment } satisfies SpeechSpineTake;
  assertTake(take, program);
  assert(!set.takes.some((item) => item.segment.id === segment.id), `Speech Spine repeats Segment ${segment.id}`);
  return sealSpeechSpineSet({
    contract: "svml.speech-spine-set@1",
    takes: [...set.takes, take],
  });
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
    contract: "svml.program-space@1",
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
    assert(targetEndSampleExclusive - targetStartSample === audio.sampleFrames,
      `Speech Segment ${take.segment.id} audio does not exactly cover its normalized frame span`);
    return {
      id: `${String(index + 1).padStart(4, "0")}:${take.segment.id}`,
      artifact: audio.artifact,
      targetStartSample,
      targetEndSampleExclusive,
      sourceSampleFrames: audio.sampleFrames,
      sourceStartSample: 0,
      sourceEndSampleExclusive: audio.sampleFrames,
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
    contract: "svml.audio-program-plan@1",
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
  const seconds = (value: number): number => value * space.frameRate.denominator / space.frameRate.numerator;
  const segments = set.takes.map((take) => {
    const startFrame = frame;
    frame += take.media.timeline.frameCount;
    return { segmentId: take.segment.id, startSec: seconds(startFrame), endSec: seconds(frame) };
  });
  const visualClips = set.takes.map((take, index) => ({
    segmentId: take.segment.id,
    artifact: {
      digest: take.media.visual!.artifact.digest,
      size: take.media.visual!.artifact.size,
      mediaType: take.media.visual!.artifact.mediaType,
      durationSec: seconds(take.media.timeline.frameCount),
    },
    startSec: segments[index]!.startSec,
    endSec: segments[index]!.endSec,
  }));
  return sealSpeechBasis({
    contract: "svml.speech-basis@1",
    programSpace: space,
    audio: structuredClone(audio.artifact),
    visualTrack: { clips: visualClips },
    segments,
  });
}
