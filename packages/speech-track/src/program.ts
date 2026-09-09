import { assertSemanticTakeIdentity } from "@hypit/speech";
import type { SemanticTake } from "@hypit/speech";
import { sealSemanticTrack } from "@hypit/semantic-track";
import type { SemanticTrack } from "@hypit/semantic-track";
import type { SpeechTrackHeader, SpeechTrackSet, SpeechTrackTake } from "./types.js";
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function sealSpeechTrackHeader(value: SpeechTrackHeader): SpeechTrackHeader { return { id: value.id }; }
export function assertSpeechTrackHeader(value: SpeechTrackHeader): void {
  assert(value.id.trim().length > 0, "SpeechTrackHeader id must not be empty");
}
function sealSpeechTrackSet(value: SpeechTrackSet): SpeechTrackSet { return structuredClone(value); }
function assertTake(take: SpeechTrackTake): void { assertSemanticTakeIdentity(take.semantic); }
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

export function appendSpeechTrackTake(set: SpeechTrackSet, semantic: SemanticTake): SpeechTrackSet {
  return appendTake(set, { semantic });
}

export function assembleSpeechTrack(
  header: SpeechTrackHeader,
  set: SpeechTrackSet,
): SemanticTrack {
  assertSpeechTrackHeader(header);
  assertSpeechTrackSet(set);
  assert(set.takes.length > 0, "Speech Track must contain at least one Take");
  for (const take of set.takes) assertTake(take);
  const narrativeId = set.takes[0]!.semantic.narrativeId;
  assert(set.takes.every((take) => take.semantic.narrativeId === narrativeId),
    "Speech Track cannot mix Takes from different Narratives");
  return sealSemanticTrack({
    id: header.id,
    narrativeId,
    items: set.takes.map((item) => ({ take: item.semantic })),
  });
}
