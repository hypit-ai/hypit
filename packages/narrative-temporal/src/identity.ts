import {
  assertExactTemporalValue,
  assertLocalTemporalDomain,
  compareExactTemporalValues,
  exactTemporalZero,
} from "@hypit/temporal";
import type { LocalTemporalDomain } from "@hypit/temporal";

import type { NarrativeAlignment } from "./types.js";

export function sealNarrativeAlignment(value: NarrativeAlignment, domain?: LocalTemporalDomain): NarrativeAlignment {
  assertNarrativeAlignmentIdentity(value, domain);
  return structuredClone(value);
}

export function assertNarrativeAlignmentIdentity(alignment: NarrativeAlignment, domain?: LocalTemporalDomain): void {
  if (!alignment.narrativeId.trim() || !alignment.domainId.trim()) throw new Error("NarrativeAlignment identity is invalid.");
  if (domain !== undefined) {
    assertLocalTemporalDomain(domain);
    if (alignment.domainId !== domain.id) throw new Error("NarrativeAlignment belongs to another local domain.");
  }
  const positions = new Map<string, NarrativeAlignment["boundaries"][number]["at"]>();
  for (const boundary of alignment.boundaries) {
    try {
      assertExactTemporalValue(boundary.at, `NarrativeAlignment boundary ${boundary.id || "<unnamed>"}`);
    } catch {
      throw new Error(`NarrativeAlignment boundary ${boundary.id || "<unnamed>"} is invalid.`);
    }
    if (!boundary.id || positions.has(boundary.id)
      || compareExactTemporalValues(boundary.at, exactTemporalZero()) < 0
      || (domain !== undefined && compareExactTemporalValues(boundary.at, domain.duration) > 0)) {
      throw new Error(`NarrativeAlignment boundary ${boundary.id || "<unnamed>"} is invalid.`);
    }
    positions.set(boundary.id, boundary.at);
  }
  const segment = alignment.segment;
  if (!segment.segmentId || !segment.startBoundaryId || !segment.endBoundaryId
    || positions.get(segment.startBoundaryId) === undefined || positions.get(segment.endBoundaryId) === undefined) {
    throw new Error("NarrativeAlignment Segment boundaries are invalid.");
  }
  if (domain !== undefined
    && (compareExactTemporalValues(positions.get(segment.startBoundaryId)!, exactTemporalZero()) !== 0
      || compareExactTemporalValues(positions.get(segment.endBoundaryId)!, domain.duration) !== 0)) {
    throw new Error("NarrativeAlignment Segment must cover its local domain.");
  }
  const tokenIds = new Set<string>();
  let previousStart = exactTemporalZero();
  let previousEnd = exactTemporalZero();
  for (const token of alignment.tokens) {
    const start = positions.get(token.startBoundaryId);
    const end = positions.get(token.endBoundaryId);
    if (!token.tokenId || tokenIds.has(token.tokenId) || token.segmentId !== segment.segmentId || !token.text
      || start === undefined || end === undefined || compareExactTemporalValues(end, start) <= 0
      || compareExactTemporalValues(start, previousStart) < 0 || compareExactTemporalValues(end, previousEnd) < 0) {
      throw new Error(`NarrativeAlignment Token ${token.tokenId || "<unnamed>"} is invalid.`);
    }
    tokenIds.add(token.tokenId);
    previousStart = start;
    previousEnd = end;
  }
}
