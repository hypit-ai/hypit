import {
  assertExactTemporalValue,
  assertLocalTemporalDomain,
  compareExactTemporalValues,
  exactTemporalZero,
} from "@hypit/temporal";
import type { LocalTemporalDomain } from "@hypit/temporal";

import type {
  NarrativeAlignment,
  NarrativeInstantSpec,
  NarrativeProjection,
  NarrativeProjectionHeader,
  NarrativeProjectionParts,
  ProjectedNarrativeAlignment,
} from "./types.js";

function nonEmpty(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} is invalid.`);
}

function assertProjectedAlignment(part: ProjectedNarrativeAlignment, label: string): void {
  if (part === null || typeof part !== "object" || Array.isArray(part)) throw new Error(`${label} is invalid.`);
  nonEmpty(part.narrativeId, `${label}.narrativeId`);
  nonEmpty(part.timelineId, `${label}.timelineId`);
  if (!Array.isArray(part.boundaries) || !Array.isArray(part.tokens)) throw new Error(`${label} is invalid.`);
  const boundaries = new Set<string>();
  for (const boundary of part.boundaries) {
    nonEmpty(boundary.id, `${label} boundary id`);
    if (boundaries.has(boundary.id) || !Number.isSafeInteger(boundary.frame) || boundary.frame < 0) {
      throw new Error(`${label} Boundary ${boundary.id} is invalid.`);
    }
    boundaries.add(boundary.id);
  }
  nonEmpty(part.segment.segmentId, `${label}.segment.segmentId`);
  if (!boundaries.has(part.segment.startBoundaryId) || !boundaries.has(part.segment.endBoundaryId)) {
    throw new Error(`${label} Segment boundaries are invalid.`);
  }
  const tokens = new Set<string>();
  for (const token of part.tokens) {
    nonEmpty(token.tokenId, `${label} token id`);
    if (tokens.has(token.tokenId) || token.segmentId !== part.segment.segmentId
      || typeof token.text !== "string" || token.text.length === 0
      || !boundaries.has(token.startBoundaryId) || !boundaries.has(token.endBoundaryId)) {
      throw new Error(`${label} Token ${token.tokenId} is invalid.`);
    }
    tokens.add(token.tokenId);
  }
}

export function assertNarrativeProjectionPartsIdentity(value: NarrativeProjectionParts): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.parts)) {
    throw new Error("NarrativeProjectionParts is invalid.");
  }
  value.parts.forEach((part, index) => assertProjectedAlignment(part, `NarrativeProjectionParts.parts.${index}`));
}

export function assertNarrativeProjectionHeaderIdentity(value: NarrativeProjectionHeader): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("NarrativeProjectionHeader is invalid.");
  }
  nonEmpty(value.id, "NarrativeProjectionHeader.id");
}

export function assertNarrativeInstantSpecIdentity(value: NarrativeInstantSpec): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("NarrativeInstantSpec is invalid.");
  }
  nonEmpty(value.id, "NarrativeInstantSpec.id");
  nonEmpty(value.subjectId, "NarrativeInstantSpec.subjectId");
  if (value.boundary !== "start" && value.boundary !== "end" && value.boundary !== "cue") {
    throw new Error("NarrativeInstantSpec.boundary is invalid.");
  }
}

export function assertNarrativeProjectionIdentity(value: NarrativeProjection): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("NarrativeProjection is invalid.");
  }
  nonEmpty(value.id, "NarrativeProjection.id");
  nonEmpty(value.narrativeId, "NarrativeProjection.narrativeId");
  nonEmpty(value.timelineId, "NarrativeProjection.timelineId");
  if (!Array.isArray(value.boundaries) || !Array.isArray(value.segments) || !Array.isArray(value.tokens)) {
    throw new Error("NarrativeProjection contents are invalid.");
  }
  const boundaries = new Set<string>();
  for (const boundary of value.boundaries) {
    nonEmpty(boundary.id, "NarrativeProjection boundary id");
    if (boundaries.has(boundary.id) || !Number.isSafeInteger(boundary.frame) || boundary.frame < 0) {
      throw new Error(`NarrativeProjection Boundary ${boundary.id} is invalid.`);
    }
    boundaries.add(boundary.id);
  }
  const segments = new Set<string>();
  for (const segment of value.segments) {
    nonEmpty(segment.segmentId, "NarrativeProjection segment id");
    if (segments.has(segment.segmentId) || !boundaries.has(segment.startBoundaryId)
      || !boundaries.has(segment.endBoundaryId)) {
      throw new Error(`NarrativeProjection Segment ${segment.segmentId} is invalid.`);
    }
    segments.add(segment.segmentId);
  }
  const tokens = new Set<string>();
  for (const token of value.tokens) {
    nonEmpty(token.tokenId, "NarrativeProjection token id");
    if (tokens.has(token.tokenId) || typeof token.text !== "string" || token.text.length === 0
      || !segments.has(token.segmentId)
      || !boundaries.has(token.startBoundaryId) || !boundaries.has(token.endBoundaryId)) {
      throw new Error(`NarrativeProjection Token ${token.tokenId} is invalid.`);
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
