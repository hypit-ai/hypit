import { assertSemanticTakeIdentity, sealSemanticTake } from "@hypit/speech";
import type { SemanticTake } from "@hypit/speech";

import type { SemanticTakeAdjustmentPlan } from "./types.js";

export function adjustSemanticTake(
  source: SemanticTake,
  plan: SemanticTakeAdjustmentPlan,
): SemanticTake {
  assertSemanticTakeIdentity(source);
  if (plan.narrativeId !== source.narrativeId) {
    throw new Error(`SemanticTake adjustment belongs to Narrative ${plan.narrativeId}, not ${source.narrativeId}.`);
  }
  if (plan.anchors.length === 0) throw new Error("SemanticTake adjustment requires at least one Anchor.");

  const sourceAnchorIds = new Set(source.anchors.map((anchor) => anchor.identity));
  const adjusted = new Map<string, number>();
  for (const anchor of plan.anchors) {
    if (!sourceAnchorIds.has(anchor.anchorId)) {
      throw new Error(`SemanticTake does not contain adjusted Anchor ${anchor.anchorId}.`);
    }
    if (adjusted.has(anchor.anchorId)) {
      throw new Error(`SemanticTake Anchor ${anchor.anchorId} is adjusted more than once.`);
    }
    if (!Number.isSafeInteger(anchor.frame) || anchor.frame < 0 || anchor.frame > source.media.timeline.frameCount) {
      throw new Error(`SemanticTake Anchor ${anchor.anchorId} has an invalid adjusted frame.`);
    }
    adjusted.set(anchor.anchorId, anchor.frame);
  }

  const frame = (anchorId: string, fallback: number): number => adjusted.get(anchorId) ?? fallback;
  return sealSemanticTake({
    ...source,
    segment: {
      ...source.segment,
      startFrame: frame(source.segment.startAnchorId, source.segment.startFrame),
      endFrameExclusive: frame(source.segment.endAnchorId, source.segment.endFrameExclusive),
    },
    anchors: source.anchors.map((anchor) => ({
      ...anchor,
      frame: frame(anchor.identity, anchor.frame),
    })),
    tokens: source.tokens.map((token) => ({
      ...token,
      startFrame: frame(token.startAnchorId, token.startFrame),
      endFrameExclusive: frame(token.endAnchorId, token.endFrameExclusive),
    })),
  });
}
