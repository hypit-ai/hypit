import { digestOf } from "@svml/protocol";
import type { CompleteSemanticMap, Narrative, TimingQuality } from "@svml/contracts";

import { CaptionProjectionError } from "./error.js";
import type {
  TimedCaptionProjection,
  TimedCaptionRefinement,
  TimedCaptionRegion,
} from "./types.js";

const QUALITY_RANK: Readonly<Record<TimingQuality, number>> = {
  measured: 0,
  derived: 1,
  estimated: 2,
};

function composedQuality(value: TimingQuality): TimingQuality {
  return QUALITY_RANK[value] >= QUALITY_RANK.derived ? value : "derived";
}

export function temporalizeCaption(
  narrative: Narrative,
  map: CompleteSemanticMap,
): TimedCaptionProjection {
  const timingByToken = new Map(map.tokens.map((token) => [token.tokenId, token]));
  const sourceTiming = (startToken: number, endTokenExclusive: number, owner: string) => {
    const source = narrative.tokens.slice(startToken, endTokenExclusive);
    const timed = source.map((token) => timingByToken.get(token.id));
    if (!timed.length || timed.some((token) => token === undefined)) {
      throw new CaptionProjectionError(
        "CAPTION_SPEECH_COVERAGE",
        `${owner} is not covered by the complete speech time map.`,
      );
    }
    const first = timed[0]!;
    const last = timed.at(-1)!;
    return {
      sourceTokenIds: source.map((token) => token.id),
      startSec: first.startSec,
      endSec: last.endSec,
      startQuality: composedQuality(first.startQuality),
      endQuality: composedQuality(last.endQuality),
    };
  };

  const regions: TimedCaptionRegion[] = narrative.captionProjection.regions.map((region) => {
    const refinements: TimedCaptionRefinement[] = region.refinements.map((refinement) => ({
      id: refinement.id,
      display: refinement.display,
      displayStart: refinement.displayStart,
      displayEnd: refinement.displayEnd,
      ...sourceTiming(refinement.startToken, refinement.endTokenExclusive, refinement.id),
      relation: refinement.relation,
    }));
    return {
      id: region.id,
      display: region.display,
      segmentId: region.segmentId,
      kind: region.kind,
      ...sourceTiming(region.startToken, region.endTokenExclusive, region.id),
      refinements,
    };
  });
  const payload = {
    contract: "svml.timed-caption-projection@1" as const,
    programSpace: map.programSpace,
    text: narrative.captionProjection.text,
    regions,
  };
  return { ...payload, projectionDigest: digestOf(payload) };
}
