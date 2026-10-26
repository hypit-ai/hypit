import { sealTimeline } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import { createNarrativeProjection, projectNarrativeAlignment } from "@hypit/narrative-temporal";
import type { NarrativeProjection } from "@hypit/narrative-temporal";
import { exactTemporalValueFromFrames } from "@hypit/temporal";

type FixtureSegment = { readonly id: string; readonly frameCount: number };
type FixtureAnchor = { readonly identity: string; readonly frame: number };

/**
 * Minimal absolute Timeline for tests whose subject is not timeline construction.
 * Semantic fixture data is deliberately not embedded; use the projection helper
 * when a test actually needs Narrative boundaries.
 */
export function timelineFixture(
  space: {
    readonly id: string;
    readonly frameRate: Timeline["frameRate"];
    readonly frameCount?: number;
    readonly durationSec?: number;
  },
  options: {
    readonly id?: string;
    readonly narrativeId?: string;
    readonly segments?: readonly FixtureSegment[];
    readonly anchors?: readonly FixtureAnchor[];
  } = {},
): Timeline {
  const frameCount = space.frameCount ?? Math.round(
    (space.durationSec ?? 0) * space.frameRate.numerator / space.frameRate.denominator,
  );
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
    throw new Error("Timeline fixture requires a positive exact frame count.");
  }
  if (options.segments !== undefined
    && options.segments.reduce((sum, segment) => sum + segment.frameCount, 0) !== frameCount) {
    throw new Error("Timeline fixture segments must fill Timeline exactly.");
  }
  for (const anchor of options.anchors ?? []) {
    if (!Number.isSafeInteger(anchor.frame) || anchor.frame < 0 || anchor.frame > frameCount) {
      throw new Error(`Timeline fixture anchor ${anchor.identity} is outside the Timeline.`);
    }
  }
  return sealTimeline({ id: options.id ?? space.id, frameRate: space.frameRate, frameCount });
}

/** Explicit semantic relation for tests that actually exercise Narrative projection. */
export function narrativeProjectionFixture(
  timeline: Timeline,
  options: {
    readonly id?: string;
    readonly narrativeId?: string;
    readonly segments: readonly FixtureSegment[];
    readonly anchors?: readonly FixtureAnchor[];
  },
): NarrativeProjection {
  const narrativeId = options.narrativeId ?? "test-narrative";
  let cursor = 0;
  const unassigned = [...(options.anchors ?? [])];
  const entries = options.segments.map((segment) => {
    const startFrame = cursor;
    const endFrameExclusive = startFrame + segment.frameCount;
    cursor = endFrameExclusive;
    const claimed = unassigned.filter((anchor) => anchor.identity.startsWith(`segment:${segment.id}:`)
      ? anchor.frame >= startFrame && anchor.frame <= endFrameExclusive
      : anchor.frame > startFrame && anchor.frame <= endFrameExclusive || startFrame === 0 && anchor.frame === 0);
    for (const anchor of claimed) unassigned.splice(unassigned.indexOf(anchor), 1);
    const startBoundaryId = `segment:${segment.id}:start`;
    const endBoundaryId = `segment:${segment.id}:end`;
    const boundaries = [
      ...claimed.map((anchor) => ({ id: anchor.identity,
        at: exactTemporalValueFromFrames(anchor.frame - startFrame, timeline) })),
      ...(claimed.some((anchor) => anchor.identity === startBoundaryId) ? [] : [{ id: startBoundaryId,
        at: exactTemporalValueFromFrames(0, timeline) }]),
      ...(claimed.some((anchor) => anchor.identity === endBoundaryId) ? [] : [{ id: endBoundaryId,
        at: exactTemporalValueFromFrames(segment.frameCount, timeline) }]),
    ];
    const domainId = `fixture:${segment.id}:domain`;
    const domain = { id: domainId, duration: exactTemporalValueFromFrames(segment.frameCount, timeline) };
    const window = {
      id: `fixture:${segment.id}:window`, subjectId: segment.id,
      start: { id: `fixture:${segment.id}:start`, subjectId: segment.id, timelineId: timeline.id, frame: startFrame },
      end: { id: `fixture:${segment.id}:end`, subjectId: segment.id, timelineId: timeline.id, frame: endFrameExclusive },
      span: { startFrame, endFrameExclusive },
    };
    return projectNarrativeAlignment(
      { narrativeId, domainId, segment: { segmentId: segment.id, startBoundaryId, endBoundaryId }, tokens: [], boundaries },
      domain,
      window,
      timeline,
    );
  });
  if (cursor !== timeline.frameCount) throw new Error("Narrative projection fixture segments must fill Timeline exactly.");
  if (unassigned.length > 0) throw new Error(`Narrative projection fixture cannot place ${unassigned[0]!.identity}.`);
  return createNarrativeProjection(options.id ?? `${timeline.id}:narrative`, narrativeId, timeline, entries);
}
