import { assertSemanticTakeIdentity } from "@hypit/speech";

import type { SemanticTrack, SemanticTrackSpan } from "./types.js";

export function sealSemanticTrack(value: SemanticTrack): SemanticTrack {
  const track = structuredClone(value);
  assertSemanticTrackIdentity(track);
  return track;
}

export function assertSemanticTrackIdentity(track: SemanticTrack): void {
  if (!track.id.trim() || !track.narrativeId.trim() || track.items.length === 0) {
    throw new Error("SemanticTrack must have identities and contain at least one item.");
  }
  const segmentIds = new Set<string>();
  const tokenIds = new Set<string>();
  const anchorIds = new Set<string>();
  let frameRate: SemanticTrack["items"][number]["take"]["media"]["timeline"]["frameRate"] | undefined;
  for (const item of track.items) {
    assertSemanticTakeIdentity(item.take);
    if (item.take.narrativeId !== track.narrativeId) {
      throw new Error(`SemanticTrack ${track.id} mixes Narrative ${item.take.narrativeId} into ${track.narrativeId}.`);
    }
    const rate = item.take.media.timeline.frameRate;
    if (frameRate === undefined) frameRate = rate;
    else if (frameRate.numerator !== rate.numerator || frameRate.denominator !== rate.denominator) {
      throw new Error("SemanticTrack items must use one frame rate.");
    }
    const segmentId = item.take.segment.segmentId;
    if (segmentIds.has(segmentId)) throw new Error(`SemanticTrack repeats Segment ${segmentId}.`);
    segmentIds.add(segmentId);
    for (const token of item.take.tokens) {
      if (tokenIds.has(token.tokenId)) throw new Error(`SemanticTrack repeats Token ${token.tokenId}.`);
      tokenIds.add(token.tokenId);
    }
    for (const anchor of item.take.anchors) {
      if (anchor.identity === "program:start" || anchor.identity === "program:end") {
        throw new Error(`SemanticTake cannot declare reserved Program Anchor ${anchor.identity}.`);
      }
      if (anchorIds.has(anchor.identity)) throw new Error(`SemanticTrack repeats Anchor ${anchor.identity}.`);
      anchorIds.add(anchor.identity);
    }
  }
}

export function semanticTrackSpans(track: SemanticTrack): readonly SemanticTrackSpan[] {
  assertSemanticTrackIdentity(track);
  let frame = 0;
  return track.items.map((item) => {
    const startFrame = frame;
    frame += item.take.media.timeline.frameCount;
    return { item, startFrame, endFrameExclusive: frame };
  });
}

export function semanticTrackFrameCount(track: SemanticTrack): number {
  return semanticTrackSpans(track).at(-1)!.endFrameExclusive;
}
