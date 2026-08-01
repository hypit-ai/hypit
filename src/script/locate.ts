import { fail } from "../diagnostics.js";
import type {
  CompleteSemanticMap,
  LocatedScript,
  MarkerBoundary,
  NarrativeIR,
  ProgramBasis,
  ProgramRange,
  SemanticMap,
} from "../model.js";
import { basisFps, semanticPoints, validateSemanticMap } from "../temporal.js";

function range(
  startFrame: number,
  endFrameExclusive: number,
  basis: ProgramBasis,
  label: string,
  requirePositive = false,
): ProgramRange {
  if (endFrameExclusive < startFrame || (requirePositive && endFrameExclusive === startFrame)) {
    fail(
      requirePositive ? "locate_nonpositive_range" : "locate_negative_range",
      `${label} resolves to non-positive range ${startFrame}..${endFrameExclusive}.`,
    );
  }
  const fps = basisFps(basis);
  return {
    startFrame,
    endFrameExclusive,
    startSec: startFrame / fps,
    endSec: endFrameExclusive / fps,
  };
}

export function boundaryAnchor(
  narrative: NarrativeIR,
  boundary: MarkerBoundary,
  affinity: "left" | "right",
): string {
  if (boundary.segmentId) {
    const segment = narrative.segments.find((item) => item.id === boundary.segmentId);
    if (!segment) fail("locate_boundary_segment", `Unknown Segment "${boundary.segmentId}".`);
    if (affinity === "left") {
      const token = narrative.tokens[boundary.tokenIndex - 1];
      if (token && token.segmentId === segment.id) return token.endAnchorId;
      return segment.startAnchorId;
    }
    const token = narrative.tokens[boundary.tokenIndex];
    if (token && token.segmentId === segment.id) return token.startAnchorId;
    return segment.endAnchorId;
  }

  const position = boundary.structuralPosition;
  if (affinity === "left") {
    return narrative.segments[position - 1]?.endAnchorId
      ?? narrative.segments[position]?.startAnchorId
      ?? fail("locate_boundary_empty", "Script has no structural boundary candidate.");
  }
  return narrative.segments[position]?.startAnchorId
    ?? narrative.segments[position - 1]?.endAnchorId
    ?? fail("locate_boundary_empty", "Script has no structural boundary candidate.");
}

export function locateScript(
  narrative: NarrativeIR,
  basis: ProgramBasis,
  map: CompleteSemanticMap,
): LocatedScript {
  if (map.contract !== "svml.complete-semantic-map.v1") {
    fail("locate_complete_required", "HTML compilation requires CompleteSemanticMap.");
  }
  return bindSemanticMap(narrative, basis, map);
}

export function bindSemanticMap(
  narrative: NarrativeIR,
  basis: ProgramBasis,
  map: SemanticMap,
): LocatedScript {
  validateSemanticMap(narrative, basis, map);
  const points = semanticPoints(map);
  const point = (identity: string): number => {
    const value = points.get(identity);
    if (value === undefined) fail("locate_anchor_missing", `SemanticMap is missing "${identity}".`);
    return value;
  };
  const fps = basisFps(basis);
  const words = narrative.tokens.map((token) => ({
    ...token,
    ...range(
      point(token.startAnchorId),
      point(token.endAnchorId),
      basis,
      `Token "${token.text}"`,
    ),
  }));
  const segments = Object.fromEntries(narrative.segments.map((segment) => [
    segment.id,
    range(
      point(segment.startAnchorId),
      point(segment.endAnchorId),
      basis,
      `Segment "${segment.id}"`,
    ),
  ]));
  const selections = Object.fromEntries(Object.entries(narrative.selections).map(
    ([id, occurrences]) => [
      id,
      {
        id,
        ranges: occurrences.map((occurrence, index) => range(
          point(boundaryAnchor(narrative, occurrence.open.boundary, occurrence.open.affinity)),
          point(boundaryAnchor(narrative, occurrence.close.boundary, occurrence.close.affinity)),
          basis,
          `Selection "${id}" occurrence ${index + 1}`,
          true,
        )),
      },
    ],
  ));
  const moments = Object.fromEntries(Object.entries(narrative.moments).map(
    ([id, occurrences]) => [
      id,
      {
        id,
        frames: occurrences.map((occurrence) => point(
          boundaryAnchor(narrative, occurrence.boundary, occurrence.affinity),
        )),
      },
    ],
  ));
  const captionAtoms = narrative.captionAtoms.map((atom) => {
    const first = words[atom.startToken];
    const last = words[atom.endTokenExclusive - 1];
    if (!first || !last || first.segmentId !== last.segmentId) {
      fail("locate_caption_atom", `Caption atom "${atom.id}" has an invalid speech span.`);
    }
    return {
      ...atom,
      ...range(first.startFrame, last.endFrameExclusive, basis, `Caption atom "${atom.id}"`),
    };
  });
  return {
    contract: "svml.temporal-binding.v1",
    basisDigest: basis.basisDigest,
    semanticMapDigest: map.mapDigest,
    durationFrames: basis.durationFrames,
    durationSec: basis.durationFrames / fps,
    fps,
    words,
    segments,
    selections,
    moments,
    captionAtoms,
  };
}
