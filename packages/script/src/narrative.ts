import { canonicalize } from "@hypit/protocol";
import type { CanonicalValue } from "@hypit/protocol";
import type { CaptionAlignmentUnit, CaptionDocument, CaptionDisplayWord } from "@hypit/narrative";
import { sealText } from "@hypit/text";

import type { ParsedCaptionRegion, ParsedNarrative } from "./types.js";
import { cleanProjection, displayWordSurfaces, joinProjection, lexicalCount } from "./lexical.js";

function turnForRegion(parsed: ParsedNarrative, region: ParsedCaptionRegion): ParsedNarrative["turns"][number] {
  const turn = parsed.turns.find((candidate) =>
    candidate.segmentId === region.segmentId
    && candidate.tokenStart < region.endTokenExclusive
    && candidate.tokenEndExclusive > region.startToken);
  if (turn === undefined) throw new Error(`Caption region ${region.id} is not owned by a Narrative Turn`);
  return turn;
}

function projectCaption(parsed: ParsedNarrative, id: string, narrativeId: string): CaptionDocument {
  const units: CaptionAlignmentUnit[] = [];
  const words: CaptionDisplayWord[] = [];
  for (const region of parsed.captionProjection.regions) {
    if (region.kind === "hidden") continue;
    const turn = turnForRegion(parsed, region);
    const surfaces = displayWordSurfaces(region.display);
    if (surfaces.length === 0) throw new Error(`Caption region ${region.id} contains no visible display surface`);
    // A Dual Text alias is one indivisible N:M correspondence unit. Ordinary prose gives one
    // unit per display surface so the author can place cue/style boundaries between words.
    const groups = region.kind === "alias"
      ? [{ surfaces, indices: surfaces.map((_, index) => index) }]
      : surfaces.map((surface, index) => ({ surfaces: [surface], indices: [index] }));
    for (const mark of region.marks) {
      if (!Number.isSafeInteger(mark.displayIndex) || mark.displayIndex < 0 || mark.displayIndex >= surfaces.length) {
        throw new Error(`Caption region ${region.id} contains an attribute outside its display words`);
      }
    }
    let sourceCursor = region.startToken;
    for (const group of groups) {
      const unitId = `${id}:unit:${units.length + 1}`;
      const unitWordIds = group.surfaces.map((surface, groupIndex) => {
        const wordId = `${unitId}:word:${groupIndex + 1}`;
        const attributes = region.marks.find((mark) => mark.displayIndex === group.indices[groupIndex])?.attributes ?? [];
        words.push({
          id: wordId,
          unitId,
          segmentId: region.segmentId,
          turnId: turn.id,
          ...(turn.role === undefined ? {} : { role: turn.role }),
          text: surface,
          attributes,
        });
        return wordId;
      });
      const sourceEnd = region.kind === "alias"
        ? region.endTokenExclusive
        : sourceCursor + group.surfaces.reduce((count, surface) => count + lexicalCount(surface), 0);
      const sourceTokenIds = parsed.tokens.slice(sourceCursor, sourceEnd).map((token) => token.id);
      if (sourceTokenIds.length === 0) throw new Error(`Caption Unit ${unitId} has no authored speech correspondence`);
      units.push({
        id: unitId,
        segmentId: region.segmentId,
        turnId: turn.id,
        ...(turn.role === undefined ? {} : { role: turn.role }),
        wordIds: unitWordIds,
        sourceTokenIds,
      });
      sourceCursor = sourceEnd;
    }
    if (sourceCursor !== region.endTokenExclusive) {
      throw new Error(`Caption identity region ${region.id} does not structurally partition its authored speech`);
    }
  }
  if (units.length === 0 || words.length === 0) throw new Error("Caption document contains no visible words");

  const tokenIndex = new Map(parsed.tokens.map((token) => [token.id, token.index]));
  const cueBreaks = parsed.captionProjection.breaks.map((breakPoint) => {
    const next = units.findIndex((unit) => {
      const indexes = unit.sourceTokenIds.map((tokenId) => tokenIndex.get(tokenId));
      return indexes.every((index): index is number => index !== undefined)
        && Math.min(...indexes) >= breakPoint.tokenIndex;
    });
    if (next <= 0 || next === -1) {
      throw new Error("Caption Cue break must lie between two complete Alignment Units");
    }
    const previous = units[next - 1]!;
    const previousIndexes = previous.sourceTokenIds.map((tokenId) => tokenIndex.get(tokenId));
    if (previousIndexes.some((index) => index === undefined)
      || Math.max(...previousIndexes as number[]) + 1 !== breakPoint.tokenIndex) {
      throw new Error("Caption Cue break cannot split an Alignment Unit");
    }
    return { afterUnitId: previous.id };
  });
  // Segment close is a hard cue boundary.  A cue cannot carry words across two
  // independent speech takes even when the author omitted an explicit `||`.
  // Keep explicit breaks, but de-duplicate the boundary when `||` was placed
  // immediately before `</segment>`.
  const breaks = new Set(cueBreaks.map((item) => item.afterUnitId));
  for (let index = 0; index < units.length - 1; index += 1) {
    if (units[index]!.segmentId === units[index + 1]!.segmentId) continue;
    breaks.add(units[index]!.id);
  }
  return {
    narrativeId,
    id,
    units,
    words,
    cueBreaks: units.filter((unit) => breaks.has(unit.id)).map((unit) => ({ afterUnitId: unit.id })),
  };
}

export function captionDocument(parsed: ParsedNarrative, id: string, narrativeId: string): CaptionDocument {
  return projectCaption(parsed, id, narrativeId);
}

export function captionDocumentValue(parsed: ParsedNarrative, id: string, narrativeId: string): CanonicalValue {
  return canonicalize(captionDocument(parsed, id, narrativeId));
}

function segmentSerializations(segment: ParsedNarrative["segments"][number]): {
  readonly dialogue: string;
  readonly speech: string;
} {
  const speechTurns: string[] = [];
  const dialogue: string[] = [];
  let role: string | undefined;
  let turn: string[] = [];
  const flush = (): void => {
    const body = joinProjection(turn);
    if (body) {
      dialogue.push(role === undefined ? body : `${role}: ${body}`);
      speechTurns.push(body);
    }
    turn = [];
  };
  for (const atom of segment.atoms) {
    if (atom.kind === "role") {
      flush();
      role = atom.label;
      continue;
    }
    turn.push(atom.speech);
  }
  flush();
  return { dialogue: dialogue.join("\n"), speech: cleanProjection(speechTurns.join(" ")) };
}

export function narrativeSegmentExcerptValue(
  parsed: ParsedNarrative,
  segment: ParsedNarrative["segments"][number],
  narrativeId: string,
): CanonicalValue {
  return canonicalize({
    kind: "segment",
    narrativeId,
    id: segment.id,
    tokenStart: segment.tokenStart,
    tokenEndExclusive: segment.tokenEndExclusive,
  });
}

export function narrativeDialogueTextValue(segment: ParsedNarrative["segments"][number]): CanonicalValue {
  return sealText(segmentSerializations(segment).dialogue) as unknown as CanonicalValue;
}

export function narrativeSpeechTextValue(segment: ParsedNarrative["segments"][number]): CanonicalValue {
  return sealText(segmentSerializations(segment).speech) as unknown as CanonicalValue;
}

export function narrativeSelectionValue(selection: ParsedNarrative["selections"][number], narrativeId: string): CanonicalValue {
  return canonicalize({
    narrativeId,
    id: selection.id,
    startAnchorId: selection.open.boundary.anchorId,
    endAnchorId: selection.close.boundary.anchorId,
  });
}

export function narrativeMomentValue(moment: ParsedNarrative["moments"][number], narrativeId: string): CanonicalValue {
  return canonicalize({ narrativeId, id: moment.id, anchorId: moment.boundary.anchorId });
}

export function narrativeValue(parsed: ParsedNarrative, id: string): CanonicalValue {
  return canonicalize({
    id,
    segments: parsed.segments.map((segment) => ({
      id: segment.id,
      startAnchorId: segment.startAnchorId,
      endAnchorId: segment.endAnchorId,
      tokenStart: segment.tokenStart,
      tokenEndExclusive: segment.tokenEndExclusive,
    })),
    tokens: parsed.tokens.map((token) => ({
      id: token.id,
      segmentId: token.segmentId,
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
      startAnchorId: selection.open.boundary.anchorId,
      endAnchorId: selection.close.boundary.anchorId,
    })),
    moments: parsed.moments.map((moment) => ({ id: moment.id, anchorId: moment.boundary.anchorId })),
    semanticIndex: {
      anchors: parsed.semanticIndex.anchors.map((anchor) => ({
        id: anchor.id,
        kind: anchor.kind,
        ...("segmentId" in anchor ? { segmentId: anchor.segmentId } : {}),
        ...("tokenId" in anchor && anchor.tokenId !== undefined ? { tokenId: anchor.tokenId } : {}),
      })),
    },
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
