import { canonicalize } from "@narratage/core";
import type { CanonicalValue } from "@narratage/protocol";

import type { ParsedNarrative } from "./types.js";

function cleanProjection(value: string): string {
  return value
    .replace(/\s+/gu, " ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/([([{])\s+/gu, "$1")
    .replace(/\s+([)\]}])/gu, "$1")
    .trim();
}

function joinProjection(parts: readonly string[]): string {
  return cleanProjection(parts.filter((part) => part.trim()).join(" "));
}

function segmentSerializations(segment: ParsedNarrative["segments"][number]): {
  readonly dialogue: string;
  readonly speech: string;
} {
  const speechParts: string[] = [];
  const dialogue: string[] = [];
  let role: string | undefined;
  let turn: string[] = [];
  const flush = (): void => {
    const body = joinProjection(turn);
    if (body) dialogue.push(role === undefined ? body : `${role}: ${body}`);
    turn = [];
  };
  for (const atom of segment.atoms) {
    if (atom.kind === "role") {
      flush();
      role = atom.label;
      continue;
    }
    speechParts.push(atom.speech);
    turn.push(atom.speech);
  }
  flush();
  return { dialogue: dialogue.join("\n"), speech: joinProjection(speechParts) };
}

function excerptContent(
  segment: ParsedNarrative["segments"][number],
  projection: "dialogue" | "speech",
): {
  readonly kind: "segment";
  readonly id: string;
  readonly tokenStart: number;
  readonly tokenEndExclusive: number;
  readonly dialogue?: string;
  readonly speech?: string;
} {
  const serializations = segmentSerializations(segment);
  return {
    kind: "segment",
    id: segment.id,
    tokenStart: segment.tokenStart,
    tokenEndExclusive: segment.tokenEndExclusive,
    ...(projection === "dialogue"
      ? { dialogue: serializations.dialogue }
      : { speech: serializations.speech }),
  };
}

export function narrativeSegmentExcerptValue(
  parsed: ParsedNarrative,
  segment: ParsedNarrative["segments"][number],
): CanonicalValue {
  const content = {
    contract: "svml.narrative-excerpt@1",
    kind: "segment",
    id: segment.id,
    tokenStart: segment.tokenStart,
    tokenEndExclusive: segment.tokenEndExclusive,
    serializations: segmentSerializations(segment),
  } as const;
  return canonicalize(content);
}

export function narrativeDialogueExcerptValue(
  segment: ParsedNarrative["segments"][number],
): CanonicalValue {
  const content = {
    contract: "svml.narrative-dialogue-excerpt@1",
    ...excerptContent(segment, "dialogue"),
  } as const;
  return canonicalize(content);
}

export function narrativeSpeechExcerptValue(
  segment: ParsedNarrative["segments"][number],
): CanonicalValue {
  const content = {
    contract: "svml.narrative-speech-excerpt@1",
    ...excerptContent(segment, "speech"),
  } as const;
  return canonicalize(content);
}

export function captionProjectionValue(parsed: ParsedNarrative): CanonicalValue {
  const content = {
    contract: parsed.captionProjection.contract,
    text: parsed.captionProjection.text,
    regions: parsed.captionProjection.regions.map(({ range: _range, ...region }) => region),
  } as const;
  return canonicalize(content);
}

export function narrativeSelectionValue(selection: ParsedNarrative["selections"][number]): CanonicalValue {
  const content = {
    contract: "svml.narrative-selection@1",
    id: selection.id,
    occurrences: selection.occurrences.map((occurrence) => ({
      occurrence: occurrence.occurrence,
      open: { affinity: occurrence.open.affinity, boundary: semanticBoundary(occurrence.open.boundary) },
      close: { affinity: occurrence.close.affinity, boundary: semanticBoundary(occurrence.close.boundary) },
    })),
  } as const;
  return canonicalize(content);
}

export function narrativeMomentValue(moment: ParsedNarrative["moments"][number]): CanonicalValue {
  const content = {
    contract: "svml.narrative-moment@1",
    id: moment.id,
    occurrences: moment.occurrences.map((occurrence) => ({
      occurrence: occurrence.occurrence,
      affinity: occurrence.affinity,
      boundary: semanticBoundary(occurrence.boundary),
    })),
  } as const;
  return canonicalize(content);
}

function semanticBoundary(boundary: {
  readonly tokenIndex: number;
  readonly structuralPosition: number;
  readonly segmentId?: string;
  readonly anchorId: string;
}): CanonicalValue {
  return canonicalize(boundary);
}

export function narrativeValue(parsed: ParsedNarrative): CanonicalValue {
  return canonicalize({
    contract: "svml.narrative@1",
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
    captionProjection: {
      contract: parsed.captionProjection.contract,
      text: parsed.captionProjection.text,
      regions: parsed.captionProjection.regions.map((region) => ({
        id: region.id,
        display: region.display,
        segmentId: region.segmentId,
        startToken: region.startToken,
        endTokenExclusive: region.endTokenExclusive,
        kind: region.kind,
        refinements: region.refinements.map((refinement) => ({
          id: refinement.id,
          display: refinement.display,
          displayStart: refinement.displayStart,
          displayEnd: refinement.displayEnd,
          startToken: refinement.startToken,
          endTokenExclusive: refinement.endTokenExclusive,
          relation: refinement.relation,
        })),
      })),
    },
    semanticIndex: parsed.semanticIndex,
    serializations: parsed.serializations,
  });
}

export function serializeSpeech(parsed: ParsedNarrative): string {
  return parsed.serializations.speech;
}

export function serializeDialogue(parsed: ParsedNarrative): string {
  return parsed.serializations.dialogue;
}

export function serializeCaption(parsed: ParsedNarrative): string {
  return parsed.captionProjection.text;
}

export function narrativeSourceMap(recordId: string, parsed: ParsedNarrative): CanonicalValue {
  return canonicalize({
    format: "svml.script-source-map@1",
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
