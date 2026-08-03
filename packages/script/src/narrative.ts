import { canonicalize } from "@svml/core";
import type { CanonicalValue } from "@svml/protocol";

import type { ParsedNarrative } from "./types.js";

function semanticBoundary(boundary: {
  readonly tokenIndex: number;
  readonly structuralPosition: number;
  readonly segmentId?: string;
}): CanonicalValue {
  return canonicalize(boundary);
}

export function narrativeValue(parsed: ParsedNarrative): CanonicalValue {
  return canonicalize({
    contract: "svml.narrative@0",
    segments: parsed.segments.map((segment) => ({
      id: segment.id,
      index: segment.index,
      startAnchorId: segment.startAnchorId,
      endAnchorId: segment.endAnchorId,
      tokenStart: segment.tokenStart,
      tokenEndExclusive: segment.tokenEndExclusive,
    })),
    tokens: parsed.tokens.map((token) => ({
      id: token.id,
      index: token.index,
      segmentId: token.segmentId,
      segmentTokenIndex: token.segmentTokenIndex,
      startAnchorId: token.startAnchorId,
      endAnchorId: token.endAnchorId,
      text: token.text,
      normalized: token.normalized,
    })),
    turns: parsed.turns.map((turn) => ({
      id: turn.id,
      segmentId: turn.segmentId,
      ...(turn.role === undefined ? {} : { role: turn.role }),
      tokenStart: turn.tokenStart,
      tokenEndExclusive: turn.tokenEndExclusive,
    })),
    selections: parsed.selections.map((selection) => ({
      id: selection.id,
      occurrences: selection.occurrences.map((occurrence) => ({
        occurrence: occurrence.occurrence,
        open: {
          affinity: occurrence.open.affinity,
          boundary: semanticBoundary(occurrence.open.boundary),
        },
        close: {
          affinity: occurrence.close.affinity,
          boundary: semanticBoundary(occurrence.close.boundary),
        },
      })),
    })),
    moments: parsed.moments.map((moment) => ({
      id: moment.id,
      occurrences: moment.occurrences.map((occurrence) => ({
        occurrence: occurrence.occurrence,
        affinity: occurrence.affinity,
        boundary: semanticBoundary(occurrence.boundary),
      })),
    })),
    captionAtoms: parsed.captionAtoms.map((atom) => ({
      id: atom.id,
      display: atom.display,
      segmentId: atom.segmentId,
      startToken: atom.startToken,
      endTokenExclusive: atom.endTokenExclusive,
    })),
    semanticIndex: parsed.semanticIndex,
    projections: parsed.projections,
  });
}

export function narrativeSourceMap(recordId: string, parsed: ParsedNarrative): CanonicalValue {
  return canonicalize({
    format: "svml.script-source-map@0",
    record: recordId,
    segments: parsed.segments.map((segment) => ({ id: segment.id, range: segment.range })),
    tokens: parsed.tokens.map((token) => ({ id: token.id, range: token.range })),
    turns: parsed.turns.map((turn) => ({ id: turn.id, range: turn.range })),
    selections: parsed.selections.map((selection) => ({
      id: selection.id,
      occurrences: selection.occurrences.map((occurrence) => ({
        occurrence: occurrence.occurrence,
        open: occurrence.open.range,
        close: occurrence.close.range,
      })),
    })),
    moments: parsed.moments.map((moment) => ({
      id: moment.id,
      occurrences: moment.occurrences.map((occurrence) => ({
        occurrence: occurrence.occurrence,
        range: occurrence.range,
      })),
    })),
  });
}
