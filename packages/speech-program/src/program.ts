import {
  assertProgramSpaceIdentity,
  sealProgramSpace,
  sealSpeechBasis,
  verifySynchronizedMedia,
  verifyTimelineAudio,
} from "@svml/contracts";
import type {
  NarrativeExcerpt,
  ProgramSpace,
  SpeechBasis,
  SynchronizedMedia,
  TimelineAudio,
} from "@svml/contracts";
import {
  sealAudioProgramPlan,
  verifyAudioProgramPlan,
} from "@svml/media-pipeline";
import type { AudioProgramPlan } from "@svml/media-pipeline";
import { canonicalize, digestOf, isDigest } from "@svml/protocol";
import type { Digest } from "@svml/protocol";

import type {
  SpeechSpineProgram,
  SpeechSpineSet,
  SpeechSpineTake,
} from "./types.js";

export const createSpeechSpineSetImplementationDigest = digestOf("@svml/speech-program/create-spine-set@1");
export const appendSpeechSpineTakeImplementationDigest = digestOf("@svml/speech-program/append-spine-take@1");
export const compileSpeechSpineAudioImplementationDigest = digestOf("@svml/speech-program/compile-spine-audio@1");
export const assembleSpeechBasisImplementationDigest = digestOf("@svml/speech-program/assemble-speech-basis@1");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function programContent(value: Omit<SpeechSpineProgram, "digest">): Omit<SpeechSpineProgram, "digest"> {
  return {
    contract: "svml.speech-spine-program@1",
    id: value.id,
    frameRate: { ...value.frameRate },
  };
}

export function sealSpeechSpineProgram(value: Omit<SpeechSpineProgram, "digest">): SpeechSpineProgram {
  const content = programContent(value);
  return { ...content, digest: digestOf(content) };
}

export function assertSpeechSpineProgram(value: SpeechSpineProgram): void {
  assert(value.contract === "svml.speech-spine-program@1", "Unsupported SpeechSpineProgram contract");
  assert(value.id.trim().length > 0, "SpeechSpineProgram id must not be empty");
  assert(Number.isSafeInteger(value.frameRate.numerator) && value.frameRate.numerator > 0
    && Number.isSafeInteger(value.frameRate.denominator) && value.frameRate.denominator > 0,
  "SpeechSpineProgram frame rate is invalid");
  const { digest: _digest, ...content } = value;
  assert(isDigest(value.digest) && value.digest === digestOf(canonicalize(content)),
    "SpeechSpineProgram digest differs from its contents");
}

function verifyExcerpt(value: NarrativeExcerpt): void {
  assert(value.contract === "svml.narrative-excerpt@1" && value.kind === "segment",
    "Speech Spine Take must reference a Segment NarrativeExcerpt");
  assert(value.id.length > 0 && Number.isSafeInteger(value.tokenStart)
    && Number.isSafeInteger(value.tokenEndExclusive) && value.tokenEndExclusive > value.tokenStart,
  "Speech Spine Segment excerpt is invalid");
  const { excerptDigest: _digest, ...content } = value;
  assert(isDigest(value.excerptDigest) && value.excerptDigest === digestOf(canonicalize(content)),
    "Speech Spine Segment excerpt digest differs from its contents");
}

function setContent(value: Omit<SpeechSpineSet, "digest">): Omit<SpeechSpineSet, "digest"> {
  return canonicalize({
    contract: "svml.speech-spine-set@1",
    program: value.program,
    takes: value.takes,
    ...(value.lastAddition === undefined ? {} : { lastAddition: value.lastAddition }),
  }) as unknown as Omit<SpeechSpineSet, "digest">;
}

function sealSpeechSpineSet(value: Omit<SpeechSpineSet, "digest">): SpeechSpineSet {
  const content = setContent(value);
  return { ...content, digest: digestOf(content) };
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
  assertSpeechSpineProgram(value.program);
  const { digest: _digest, ...content } = value;
  assert(isDigest(value.digest) && value.digest === digestOf(setContent(content)),
    "SpeechSpineSet digest differs from its contents");
  const segments = new Set<string>();
  for (const take of value.takes) {
    assertTake(take, value.program);
    assert(!segments.has(take.segment.id), `Speech Spine repeats Segment ${take.segment.id}`);
    segments.add(take.segment.id);
  }
  assert(value.takes.length === 0 ? value.lastAddition === undefined : value.lastAddition !== undefined,
    "SpeechSpineSet last addition is inconsistent");
  if (value.lastAddition !== undefined) {
    const last = value.takes.at(-1)!;
    assert(isDigest(value.lastAddition.previousSetDigest)
      && value.lastAddition.segmentDigest === last.segment.excerptDigest
      && value.lastAddition.mediaDigest === last.media.synchronizedMediaDigest,
    "SpeechSpineSet last addition is invalid");
  }
}

export function createSpeechSpineSet(program: SpeechSpineProgram): SpeechSpineSet {
  assertSpeechSpineProgram(program);
  return sealSpeechSpineSet({
    contract: "svml.speech-spine-set@1",
    program,
    takes: [],
  });
}

export function appendSpeechSpineTake(
  set: SpeechSpineSet,
  media: SynchronizedMedia,
  segment: NarrativeExcerpt,
): SpeechSpineSet {
  assertSpeechSpineSet(set);
  const take = { media, segment } satisfies SpeechSpineTake;
  assertTake(take, set.program);
  assert(!set.takes.some((item) => item.segment.id === segment.id), `Speech Spine repeats Segment ${segment.id}`);
  return sealSpeechSpineSet({
    contract: "svml.speech-spine-set@1",
    program: set.program,
    takes: [...set.takes, take],
    lastAddition: {
      previousSetDigest: set.digest,
      segmentDigest: segment.excerptDigest,
      mediaDigest: media.synchronizedMediaDigest,
    },
  });
}

function frameSample(frame: number, frameRate: SpeechSpineProgram["frameRate"]): number {
  const numerator = BigInt(frame) * 48_000n * BigInt(frameRate.denominator);
  const denominator = BigInt(frameRate.numerator);
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  assert(rounded <= BigInt(Number.MAX_SAFE_INTEGER), "Speech Spine sample boundary exceeds safe arithmetic");
  return Number(rounded);
}

function programSpace(set: SpeechSpineSet): ProgramSpace {
  assertSpeechSpineSet(set);
  assert(set.takes.length > 0, "Speech Spine must contain at least one Take");
  const frameCount = set.takes.reduce((sum, take) => sum + take.media.timeline.frameCount, 0);
  const space = sealProgramSpace({
    contract: "svml.program-space@0",
    durationSec: frameCount * set.program.frameRate.denominator / set.program.frameRate.numerator,
    frameRate: { ...set.program.frameRate },
  });
  assertProgramSpaceIdentity(space);
  return space;
}

export function compileSpeechSpineAudio(set: SpeechSpineSet): AudioProgramPlan {
  const space = programSpace(set);
  let frame = 0;
  const clips = set.takes.map((take, index) => {
    const audio = take.media.audio!;
    const startFrame = frame;
    frame += take.media.timeline.frameCount;
    const targetStartSample = frameSample(startFrame, set.program.frameRate);
    const targetEndSampleExclusive = frameSample(frame, set.program.frameRate);
    assert(targetEndSampleExclusive - targetStartSample === audio.sampleFrames,
      `Speech Segment ${take.segment.id} audio does not exactly cover its normalized frame span`);
    return {
      id: `${String(index + 1).padStart(4, "0")}:${take.segment.id}`,
      artifact: audio.artifact,
      targetStartSample,
      targetEndSampleExclusive,
      sourceStartSample: 0,
      playbackRate: 1,
      gain: 1,
      fadeInSamples: 0,
      fadeOutSamples: 0,
      bus: "speech" as const,
    };
  });
  const plan = sealAudioProgramPlan({
    contract: "svml.audio-program-plan@1",
    programSpaceDigest: space.digest,
    frameRate: { ...space.frameRate },
    frameCount: frame,
    sampleRate: 48_000,
    sampleFrames: frameSample(frame, set.program.frameRate),
    clips,
    mix: { normalize: false, limiter: "none" },
  });
  verifyAudioProgramPlan(plan);
  return plan;
}

export function assembleSpeechBasis(set: SpeechSpineSet, audio: TimelineAudio): SpeechBasis {
  const space = programSpace(set);
  const plan = compileSpeechSpineAudio(set);
  verifyTimelineAudio(audio);
  assert(audio.planDigest === plan.planDigest && audio.programSpaceDigest === space.digest,
    "TimelineAudio does not realize this Speech Spine plan");
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
    audio: {
      digest: audio.artifact.digest,
      size: audio.artifact.size,
      mediaType: audio.artifact.mediaType,
      durationSec: space.durationSec,
    },
    visualTrack: { clips: visualClips },
    segments,
  });
}
