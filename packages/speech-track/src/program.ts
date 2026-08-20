import { assertSemanticTakeIdentity } from "@hypit/speech";
import type { SemanticTake } from "@hypit/speech";
import { sealSemanticTrack } from "@hypit/semantic-track";
import type { SemanticTrack } from "@hypit/semantic-track";
import { canonicalize } from "@hypit/protocol";
import { assertContentFit, assertSpatialFrame } from "@hypit/spatial";
import type { ContentFit, SpatialFrame } from "@hypit/spatial";

import type {
  SpeechTrackHeader,
  SpeechTrackSet,
  SpeechTrackTake,
  SpeechTrackVisualSpec,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function headerContent(value: SpeechTrackHeader): SpeechTrackHeader {
  return { id: value.id };
}

export function sealSpeechTrackHeader(value: SpeechTrackHeader): SpeechTrackHeader {
  return headerContent(value);
}

export function assertSpeechTrackHeader(value: SpeechTrackHeader): void {
  assert(value.id.trim().length > 0, "SpeechTrackHeader id must not be empty");
}

function setContent(value: SpeechTrackSet): SpeechTrackSet {
  return canonicalize({
    takes: value.takes,
  }) as unknown as SpeechTrackSet;
}

function sealSpeechTrackSet(value: SpeechTrackSet): SpeechTrackSet {
  return setContent(value);
}

function assertTake(take: SpeechTrackTake): void {
  assertSemanticTakeIdentity(take.semantic);
  const { media, segment } = take.semantic;
  assert((media.visual === undefined) === (take.visual === undefined),
    `Speech Segment ${segment.segmentId} visual policy does not match its media`);
  if (take.visual !== undefined) {
    assertSpatialFrame(take.visual.frame);
    assertContentFit(take.visual.fit);
    assert(Number.isSafeInteger(take.visual.stackingOrder),
      `Speech Segment ${segment.segmentId} visual stacking order is invalid`);
  }
}

export function sealSpeechTrackVisualSpec(value: SpeechTrackVisualSpec): SpeechTrackVisualSpec {
  const result = structuredClone(value);
  assertSpeechTrackVisualSpec(result);
  return result;
}

export function assertSpeechTrackVisualSpec(value: SpeechTrackVisualSpec): void {
  assert(Number.isSafeInteger(value.stackingOrder), "SpeechTrackVisualSpec stacking order is invalid");
}

export function assertSpeechTrackSet(value: SpeechTrackSet): void {
  const segments = new Set<string>();
  for (const take of value.takes) {
    assertSemanticTakeIdentity(take.semantic);
    const segmentId = take.semantic.segment.segmentId;
    assert(!segments.has(segmentId), `Speech Track repeats Segment ${segmentId}`);
    segments.add(segmentId);
  }
}

export function createSpeechTrackSet(): SpeechTrackSet {
  return sealSpeechTrackSet({
    takes: [],
  });
}

function appendTake(
  set: SpeechTrackSet,
  take: SpeechTrackTake,
): SpeechTrackSet {
  assertSpeechTrackSet(set);
  assertTake(take);
  assert(!set.takes.some((item) => item.semantic.segment.segmentId === take.semantic.segment.segmentId),
    `Speech Track repeats Segment ${take.semantic.segment.segmentId}`);
  return sealSpeechTrackSet({
    takes: [...set.takes, take],
  });
}

export function appendSpeechTrackTake(
  set: SpeechTrackSet,
  semantic: SemanticTake,
  frame: SpatialFrame,
  fit: ContentFit,
  visualSpec: SpeechTrackVisualSpec,
): SpeechTrackSet {
  assertSpatialFrame(frame);
  assertContentFit(fit);
  assertSpeechTrackVisualSpec(visualSpec);
  assertSemanticTakeIdentity(semantic);
  const take = {
    semantic,
    ...(semantic.media.visual === undefined ? {} : { visual: {
      frame: structuredClone(frame),
      fit: structuredClone(fit),
      stackingOrder: visualSpec.stackingOrder,
    } }),
  } satisfies SpeechTrackTake;
  return appendTake(set, take);
}

export function assembleSpeechTrack(
  header: SpeechTrackHeader,
  set: SpeechTrackSet,
): SemanticTrack {
  assertSpeechTrackHeader(header);
  assertSpeechTrackSet(set);
  assert(set.takes.length > 0, "Speech Track must contain at least one Take");
  for (const take of set.takes) assertTake(take);
  return sealSemanticTrack({
    id: header.id,
    items: set.takes.map((item) => ({ take: item.semantic })),
  });
}
