import type { NarrativeExcerpt, NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";

import { assertSemanticTrackIdentity, semanticTrackSpans } from "./identity.js";
import type { LocatedFrameSpan, SemanticTrack } from "./types.js";

export function assertNarrativeSelectionIdentity(selection: NarrativeSelectionRef): void {
  if (!selection.id || !selection.startAnchorId || !selection.endAnchorId) throw new Error("NarrativeSelection is invalid");
}

export function assertNarrativeMomentIdentity(moment: NarrativeMomentRef): void {
  if (!moment.id || !moment.anchorId) throw new Error("NarrativeMoment is invalid");
}

function anchorFrames(track: SemanticTrack): ReadonlyMap<string, number> {
  return new Map(semanticTrackSpans(track).flatMap(({ item, startFrame }) =>
    item.take.anchors.map((anchor) => [anchor.identity, startFrame + anchor.frame] as const)));
}

function frameFor(frames: ReadonlyMap<string, number>, anchorId: string, owner: string): number {
  const frame = frames.get(anchorId);
  if (frame === undefined) throw new Error(`${owner} names Anchor ${anchorId}, which this SemanticTrack does not contain.`);
  return frame;
}

export function selectionFrameSpan(
  track: SemanticTrack,
  selection: NarrativeSelectionRef,
): LocatedFrameSpan {
  assertSemanticTrackIdentity(track);
  assertNarrativeSelectionIdentity(selection);
  const frames = anchorFrames(track);
  return {
    startFrame: frameFor(frames, selection.startAnchorId, `NarrativeSelection ${selection.id}`),
    endFrameExclusive: frameFor(frames, selection.endAnchorId, `NarrativeSelection ${selection.id}`),
  };
}

export function segmentFrameSpan(track: SemanticTrack, segment: NarrativeExcerpt): LocatedFrameSpan {
  assertSemanticTrackIdentity(track);
  if (segment.kind !== "segment" || !segment.id) throw new Error("Narrative Segment excerpt is invalid");
  const found = semanticTrackSpans(track).find(({ item }) => item.take.segment.segmentId === segment.id);
  if (found === undefined) throw new Error(`SemanticTrack does not contain Segment ${segment.id}.`);
  return { startFrame: found.startFrame, endFrameExclusive: found.endFrameExclusive };
}

export function tokenFrameSpan(track: SemanticTrack, tokenIds: readonly string[]): LocatedFrameSpan | undefined {
  assertSemanticTrackIdentity(track);
  if (tokenIds.length === 0) return undefined;
  const timing = new Map(semanticTrackSpans(track).flatMap(({ item, startFrame }) =>
    item.take.tokens.map((token) => [token.tokenId, {
      startFrame: startFrame + token.startFrame,
      endFrameExclusive: startFrame + token.endFrameExclusive,
    }] as const)));
  const located = tokenIds.map((id) => timing.get(id));
  if (located.some((item) => item === undefined)) return undefined;
  return {
    startFrame: located[0]!.startFrame,
    endFrameExclusive: located.at(-1)!.endFrameExclusive,
  };
}

export function momentFrame(track: SemanticTrack, moment: NarrativeMomentRef): number {
  assertSemanticTrackIdentity(track);
  assertNarrativeMomentIdentity(moment);
  const frames = anchorFrames(track);
  return frameFor(frames, moment.anchorId, `NarrativeMoment ${moment.id}`);
}
