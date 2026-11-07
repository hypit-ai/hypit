import {
  assertExactTemporalValue,
  assertLocalTemporalDomain,
  compareExactTemporalValues,
  exactTemporalZero,
} from "@hypit/temporal";
import type { LocalTemporalDomain } from "@hypit/temporal";

import type {
  NarrativeAlignment,
  NarrativeLocalTiming,
  NarrativeTimingHeader,
  NarrativeTimingParts,
} from "./types.js";

function nonEmpty(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} is invalid.`);
}

function sameDomain(left: LocalTemporalDomain, right: LocalTemporalDomain): boolean {
  return left.id === right.id
    && compareExactTemporalValues(left.duration, right.duration) === 0;
}

export function assertNarrativeTimingPartsIdentity(value: NarrativeTimingParts): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || !Array.isArray(value.alignments)) {
    throw new Error("NarrativeTimingParts is invalid.");
  }
  value.alignments.forEach((alignment) => assertNarrativeAlignmentIdentity(alignment));
}

export function assertNarrativeTimingHeaderIdentity(value: NarrativeTimingHeader): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("NarrativeTimingHeader is invalid.");
  }
  nonEmpty(value.id, "NarrativeTimingHeader.id");
}

export function assertNarrativeLocalTimingIdentity(value: NarrativeLocalTiming): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("NarrativeLocalTiming is invalid.");
  }
  nonEmpty(value.id, "NarrativeLocalTiming.id");
  nonEmpty(value.narrativeId, "NarrativeLocalTiming.narrativeId");
  assertLocalTemporalDomain(value.domain);
  if (!Array.isArray(value.boundaries) || !Array.isArray(value.segments) || !Array.isArray(value.tokens)) {
    throw new Error("NarrativeLocalTiming contents are invalid.");
  }
  const boundaries = new Set<string>();
  for (const boundary of value.boundaries) {
    nonEmpty(boundary.id, "NarrativeLocalTiming boundary id");
    try {
      assertExactTemporalValue(boundary.at, `NarrativeLocalTiming Boundary ${boundary.id}`);
    } catch {
      throw new Error(`NarrativeLocalTiming Boundary ${boundary.id} is invalid.`);
    }
    if (boundaries.has(boundary.id)
      || compareExactTemporalValues(boundary.at, exactTemporalZero()) < 0
      || compareExactTemporalValues(boundary.at, value.domain.duration) > 0) {
      throw new Error(`NarrativeLocalTiming Boundary ${boundary.id} is invalid.`);
    }
    boundaries.add(boundary.id);
  }
  const segments = new Set<string>();
  for (const segment of value.segments) {
    nonEmpty(segment.segmentId, "NarrativeLocalTiming segment id");
    if (segments.has(segment.segmentId) || !boundaries.has(segment.startBoundaryId)
      || !boundaries.has(segment.endBoundaryId)) {
      throw new Error(`NarrativeLocalTiming Segment ${segment.segmentId} is invalid.`);
    }
    segments.add(segment.segmentId);
  }
  const tokens = new Set<string>();
  for (const token of value.tokens) {
    nonEmpty(token.tokenId, "NarrativeLocalTiming token id");
    if (tokens.has(token.tokenId) || typeof token.text !== "string" || token.text.length === 0
      || !segments.has(token.segmentId)
      || !boundaries.has(token.startBoundaryId) || !boundaries.has(token.endBoundaryId)) {
      throw new Error(`NarrativeLocalTiming Token ${token.tokenId} is invalid.`);
    }
    tokens.add(token.tokenId);
  }
}

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

export function assertNarrativeTimingDomain(
  timing: NarrativeLocalTiming,
  domain: LocalTemporalDomain,
): void {
  assertNarrativeLocalTimingIdentity(timing);
  assertLocalTemporalDomain(domain);
  if (!sameDomain(timing.domain, domain)) {
    throw new Error(`NarrativeLocalTiming belongs to ${timing.domain.id}, not ${domain.id}.`);
  }
}
