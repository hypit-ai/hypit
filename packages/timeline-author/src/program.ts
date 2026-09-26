import { assertProgramClockIdentity, type ProgramClock } from "@hypit/program-space";
import { durationInFrames, type TemporalDuration } from "@hypit/temporal";
import { parseTemporalDuration } from "@hypit/temporal-markup";
import { assertSemanticTakeIdentity } from "@hypit/speech";
import type { SemanticTake } from "@hypit/speech";
import { sealTimeline } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import type { TimelineAuthorHeader, TimelineAuthorSet, TimelineAuthorTake } from "./types.js";
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function sealTimelineAuthorHeader(value: TimelineAuthorHeader): TimelineAuthorHeader { return structuredClone(value); }
export function assertTimelineAuthorHeader(value: TimelineAuthorHeader): void {
  assert(value.id.trim().length > 0, "TimelineAuthorHeader id must not be empty");
}
function sealTimelineAuthorSet(value: TimelineAuthorSet): TimelineAuthorSet { return structuredClone(value); }
function assertTake(take: TimelineAuthorTake): void { assertSemanticTakeIdentity(take.semantic); }
export function assertTimelineAuthorSet(value: TimelineAuthorSet): void {
  const segments = new Set<string>();
  for (const take of value.takes) {
    assertSemanticTakeIdentity(take.semantic);
    const segmentId = take.semantic.segment.segmentId;
    assert(!segments.has(segmentId), `Timeline repeats Segment ${segmentId}`);
    segments.add(segmentId);
  }
}

export function createTimelineAuthorSet(): TimelineAuthorSet {
  return sealTimelineAuthorSet({
    takes: [],
  });
}

function appendTake(
  set: TimelineAuthorSet,
  take: TimelineAuthorTake,
): TimelineAuthorSet {
  assertTimelineAuthorSet(set);
  assertTake(take);
  assert(!set.takes.some((item) => item.semantic.segment.segmentId === take.semantic.segment.segmentId),
    `Timeline repeats Segment ${take.semantic.segment.segmentId}`);
  return sealTimelineAuthorSet({
    takes: [...set.takes, take],
  });
}

export function appendTimelineAuthorTake(set: TimelineAuthorSet, semantic: SemanticTake): TimelineAuthorSet {
  return appendTake(set, { semantic });
}

export function assembleTimelineAuthor(
  header: TimelineAuthorHeader,
  set: TimelineAuthorSet,
  clock: ProgramClock,
): Timeline {
  assertTimelineAuthorHeader(header);
  assertTimelineAuthorSet(set);
  assertProgramClockIdentity(clock);
  if (header.at !== undefined && header.at.length !== set.takes.length) {
    throw new Error("Timeline placement declarations must correspond to its Takes.");
  }
  const narrativeId = set.takes[0]?.semantic.narrativeId;
  let previousEnd = 0;
  let contentEnd = 0;
  const items = set.takes.map((item, index) => {
    const at = header.at?.[index] ?? (index === 0 ? "0f" : "previous.end");
    const startFrame = placementFrame(at, clock, index === 0 ? undefined : previousEnd, "previous.end");
    previousEnd = startFrame + item.semantic.media.timeline.frameCount;
    contentEnd = Math.max(contentEnd, previousEnd);
    return { take: item.semantic, startFrame };
  });
  const endFrame = placementFrame(header.end ?? "content.end", clock, contentEnd, "content.end");
  assert(endFrame > 0, "Timeline needs a positive end; an empty Timeline requires an authored extent.");
  assert(endFrame >= contentEnd, "Timeline end precedes placed content; choose an end that includes its Takes.");
  return sealTimeline({
    id: header.id, frameRate: clock.frameRate,
    durationSec: endFrame * clock.frameRate.denominator / clock.frameRate.numerator,
    ...(narrativeId === undefined ? {} : { narrativeId }), items,
  });
}

/** Parse local placement syntax before any upstream material needs to run. */
export function placementExpression(expression: string, reference: string) {
  const value = expression.trim();
  if (!value.startsWith(reference)) return { relative: false, sign: 1,
    duration: parseTemporalDuration(value, "Timeline position") };
  const offset = value.slice(reference.length).trim();
  if (offset === "") return { relative: true, sign: 1,
    duration: parseTemporalDuration("0f", "Timeline offset") };
  const match = /^([+-])\s*(.+)$/u.exec(offset);
  if (match === null) throw new Error(`Invalid Timeline position ${expression}.`);
  return { relative: true, sign: match[1] === "-" ? -1 : 1,
    duration: parseTemporalDuration(match[2]!, "Timeline offset") };
}

function exactPlacementFrames(expression: string, duration: TemporalDuration, clock: ProgramClock): number {
  const frames = durationInFrames(duration, clock);
  if (frames.denominator !== 1n || frames.numerator > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Timeline duration ${expression} must land on an exact frame boundary.`);
  }
  return Number(frames.numerator);
}

export function assertPlacementFrameBoundary(expression: string, clock: ProgramClock, reference: string): void {
  const parsed = placementExpression(expression, reference);
  exactPlacementFrames(expression, parsed.duration, clock);
}

/** Resolve local assembly expressions before a complete Timeline exists. */
export function placementFrame(expression: string, clock: ProgramClock, base: number | undefined, reference: string): number {
  const parsed = placementExpression(expression, reference);
  if (parsed.relative && base === undefined) throw new Error(`${reference} has no preceding Take.`);
  const frame = (parsed.relative ? base! : 0) + parsed.sign * exactPlacementFrames(expression, parsed.duration, clock);
  if (!Number.isSafeInteger(frame) || frame < 0) throw new Error(`Timeline position ${expression} must resolve to a non-negative frame.`);
  return frame;
}
