import { canonicalize } from "@narratage/protocol";
import type { CanonicalValue } from "@narratage/protocol";
import type {
  CaptionCorrespondence,
  CaptionDisplayAtom,
  CaptionDisplaySequence,
  CaptionDisplayWord,
  CaptionDisplayWordSubset,
} from "@narratage/narrative";
import { sealText } from "@narratage/text";

import type { ParsedCaptionRegion, ParsedNarrative } from "./types.js";

const LEXICAL_WORD =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]\p{M}*|[\p{L}\p{M}\p{N}]+(?:['’.-][\p{L}\p{M}\p{N}]+)*/gu;
const DISPLAY_SURFACE = /\S+/gu;

function lexicalCount(value: string): number {
  LEXICAL_WORD.lastIndex = 0;
  let count = 0;
  while (LEXICAL_WORD.exec(value)) count += 1;
  return count;
}

/**
 * The official Script reader is English-first: authored whitespace is the primary display-word
 * boundary and punctuation inside a surface is preserved. A punctuation-only surface is attached
 * to its left neighbour; a leading one is attached to the first following word. This is lexical
 * ownership, not semantic interpretation.
 */
function displayWords(value: string): string[] {
  const chunks: string[] = [];
  DISPLAY_SURFACE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DISPLAY_SURFACE.exec(value))) chunks.push(match[0]);
  const result: string[] = [];
  let leading = "";
  for (const chunk of chunks) {
    if (lexicalCount(chunk) > 0) {
      result.push(leading ? `${leading} ${chunk}` : chunk);
      leading = "";
    } else if (result.length > 0) {
      result[result.length - 1] = `${result.at(-1)!} ${chunk}`;
    } else {
      leading = leading ? `${leading} ${chunk}` : chunk;
    }
  }
  if (leading) result.push(leading);
  return result;
}

function turnForRegion(parsed: ParsedNarrative, region: ParsedCaptionRegion): ParsedNarrative["turns"][number] {
  const turn = parsed.turns.find((candidate) =>
    candidate.segmentId === region.segmentId
    && candidate.tokenStart < region.endTokenExclusive
    && candidate.tokenEndExclusive > region.startToken);
  if (turn === undefined) throw new Error(`Caption region ${region.id} is not owned by a Narrative Turn`);
  return turn;
}

function projectCaption(
  parsed: ParsedNarrative,
  id: string,
): { readonly display: CaptionDisplaySequence; readonly correspondence: CaptionCorrespondence } {
  const atoms: CaptionDisplayAtom[] = [];
  const words: CaptionDisplayWord[] = [];
  const correspondence: Array<{ atomId: string; sourceTokenIds: string[] }> = [];
  for (const region of parsed.captionProjection.regions) {
    if (region.kind === "hidden") continue;
    const turn = turnForRegion(parsed, region);
    const surfaces = displayWords(region.display);
    if (surfaces.length === 0) throw new Error(`Caption region ${region.id} contains no visible display surface`);
    const groups = region.kind === "alias" ? [surfaces] : surfaces.map((surface) => [surface]);
    let sourceCursor = region.startToken;
    for (const group of groups) {
      const atomId = `${id}:atom:${atoms.length + 1}`;
      const atomWordIds = group.map((surface, groupIndex) => {
        const wordId = `${atomId}:word:${groupIndex + 1}`;
        words.push({
          id: wordId,
          atomId,
          segmentId: region.segmentId,
          turnId: turn.id,
          ...(turn.role === undefined ? {} : { role: turn.role }),
          text: surface,
        });
        return wordId;
      });
      atoms.push({
        id: atomId,
        segmentId: region.segmentId,
        turnId: turn.id,
        ...(turn.role === undefined ? {} : { role: turn.role }),
        wordIds: atomWordIds,
      });
      const sourceEnd = region.kind === "alias"
        ? region.endTokenExclusive
        : sourceCursor + group.reduce((count, surface) => count + lexicalCount(surface), 0);
      const sourceTokenIds = parsed.tokens.slice(sourceCursor, sourceEnd).map((token) => token.id);
      if (sourceTokenIds.length === 0) throw new Error(`Caption Atom ${atomId} has no authored speech correspondence`);
      correspondence.push({ atomId, sourceTokenIds });
      sourceCursor = sourceEnd;
    }
    if (sourceCursor !== region.endTokenExclusive) {
      throw new Error(`Caption identity region ${region.id} does not structurally partition its authored speech`);
    }
  }
  if (atoms.length === 0 || words.length === 0) throw new Error("Caption display contains no visible words");
  return {
    display: {

      id,
      atoms,
      words,
    },
    correspondence: {

      displaySequenceId: id,
      atoms: correspondence,
    },
  };
}

export function captionDisplaySequence(parsed: ParsedNarrative, id: string): CaptionDisplaySequence {
  return projectCaption(parsed, id).display;
}

export function captionCorrespondence(parsed: ParsedNarrative, id: string): CaptionCorrespondence {
  return projectCaption(parsed, id).correspondence;
}

/** Project one authored Selection into whole visible Atoms before public values lose source positions. */
export function captionSelectionWordSubset(
  parsed: ParsedNarrative,
  sequence: CaptionDisplaySequence,
  correspondence: CaptionCorrespondence,
  selection: ParsedNarrative["selections"][number],
): CaptionDisplayWordSubset {
  const ranges = selection.occurrences.map((occurrence) => ({
    start: occurrence.open.boundary.tokenIndex,
    endExclusive: occurrence.close.boundary.tokenIndex,
  }));
  const tokenIndex = new Map(parsed.tokens.map((token) => [token.id, token.index]));
  const atomById = new Map(sequence.atoms.map((atom) => [atom.id, atom]));
  const wordIds: string[] = [];
  for (const mapping of correspondence.atoms) {
    const indexes = mapping.sourceTokenIds.map((id) => tokenIndex.get(id));
    if (indexes.some((index) => index === undefined)) throw new Error(`Caption Atom ${mapping.atomId} references an unknown speech token`);
    const start = Math.min(...indexes as number[]);
    const endExclusive = Math.max(...indexes as number[]) + 1;
    const intersects = ranges.some((range) =>
      start < range.endExclusive && endExclusive > range.start);
    const contained = ranges.some((range) =>
      start >= range.start && endExclusive <= range.endExclusive);
    if (intersects && !contained) {
      throw new Error(`Selection ${selection.id} owns only part of Caption Atom ${mapping.atomId}`);
    }
    if (contained) {
      const atom = atomById.get(mapping.atomId);
      if (atom === undefined) throw new Error(`Caption correspondence references unknown Atom ${mapping.atomId}`);
      wordIds.push(...atom.wordIds);
    }
  }
  return {

    id: selection.id,
    sequenceId: sequence.id,
    wordIds,
  };
}

export function captionDisplaySequenceValue(parsed: ParsedNarrative, id: string): CanonicalValue {
  return canonicalize(captionDisplaySequence(parsed, id));
}

export function captionCorrespondenceValue(parsed: ParsedNarrative, id: string): CanonicalValue {
  return canonicalize(captionCorrespondence(parsed, id));
}

export function captionSelectionWordSubsetValue(
  parsed: ParsedNarrative,
  sequence: CaptionDisplaySequence,
  correspondence: CaptionCorrespondence,
  selection: ParsedNarrative["selections"][number],
): CanonicalValue {
  return canonicalize(captionSelectionWordSubset(parsed, sequence, correspondence, selection));
}

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

export function narrativeSegmentExcerptValue(
  parsed: ParsedNarrative,
  segment: ParsedNarrative["segments"][number],
): CanonicalValue {
  const content = {

    kind: "segment",
    id: segment.id,
    tokenStart: segment.tokenStart,
    tokenEndExclusive: segment.tokenEndExclusive,
  } as const;
  return canonicalize(content);
}

export function narrativeDialogueTextValue(
  segment: ParsedNarrative["segments"][number],
): CanonicalValue {
  return sealText(segmentSerializations(segment).dialogue) as unknown as CanonicalValue;
}

export function narrativeSpeechTextValue(
  segment: ParsedNarrative["segments"][number],
): CanonicalValue {
  return sealText(segmentSerializations(segment).speech) as unknown as CanonicalValue;
}

export function narrativeSelectionValue(selection: ParsedNarrative["selections"][number]): CanonicalValue {
  const content = {

    id: selection.id,
    occurrences: selection.occurrences.map((occurrence) => ({
      occurrence: occurrence.occurrence,
      startAnchorId: occurrence.open.boundary.anchorId,
      endAnchorId: occurrence.close.boundary.anchorId,
    })),
  } as const;
  return canonicalize(content);
}

export function narrativeMomentValue(moment: ParsedNarrative["moments"][number]): CanonicalValue {
  const content = {

    id: moment.id,
    occurrences: moment.occurrences.map((occurrence) => ({
      occurrence: occurrence.occurrence,
      anchorId: occurrence.boundary.anchorId,
    })),
  } as const;
  return canonicalize(content);
}

export function narrativeValue(parsed: ParsedNarrative): CanonicalValue {
  return canonicalize({

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
      occurrences: selection.occurrences.map((occurrence) => ({
        occurrence: occurrence.occurrence,
        startAnchorId: occurrence.open.boundary.anchorId,
        endAnchorId: occurrence.close.boundary.anchorId,
      })),
    })),
    moments: parsed.moments.map((moment) => ({
      id: moment.id,
      occurrences: moment.occurrences.map((occurrence) => ({
        occurrence: occurrence.occurrence,
        anchorId: occurrence.boundary.anchorId,
      })),
    })),
    semanticIndex: {

      anchors: parsed.semanticIndex.anchors.map((anchor) => ({
        id: anchor.id,
        kind: anchor.kind,
        segmentId: anchor.segmentId,
        ...(anchor.tokenId === undefined ? {} : { tokenId: anchor.tokenId }),
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
