import type { CaptionDocument, Narrative, NarrativeSelection } from "@hypit/narrative";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertCaptionDocument(value: CaptionDocument): void {
  assert(value.id.length > 0, "CaptionDocument identity is invalid");
  assert(value.units.length > 0 && value.words.length > 0, "CaptionDocument is empty");
  const words = new Map(value.words.map((word) => [word.id, word]));
  assert(words.size === value.words.length, "CaptionDocument word ids are repeated");
  const units = new Set<string>();
  const orderedWordIds: string[] = [];
  for (const unit of value.units) {
    assert(unit.id.length > 0 && !units.has(unit.id), "CaptionDocument unit ids are repeated");
    units.add(unit.id);
    assert(unit.wordIds.length > 0 && unit.sourceTokenIds.length > 0, `Caption unit ${unit.id} is empty`);
    for (const wordId of unit.wordIds) {
      const word = words.get(wordId);
      assert(word !== undefined && word.unitId === unit.id, `Caption unit ${unit.id} references a foreign word`);
      assert(word.segmentId === unit.segmentId && word.turnId === unit.turnId && word.role === unit.role,
        `Caption unit ${unit.id} disagrees with its word context`);
      orderedWordIds.push(wordId);
    }
  }
  assert(orderedWordIds.join("\0") === value.words.map((word) => word.id).join("\0"),
    "CaptionDocument words must be partitioned by units in order");
  const breakIds = new Set<string>();
  for (const cueBreak of value.cueBreaks) {
    assert(units.has(cueBreak.afterUnitId) && !breakIds.has(cueBreak.afterUnitId),
      "CaptionDocument cue break names an unknown or repeated unit");
    breakIds.add(cueBreak.afterUnitId);
  }
}

export type CaptionUnitSubset = {
  readonly documentId: string;
  readonly unitIds: readonly string[];
};

function tokenBoundary(narrative: Narrative, anchorId: string, owner: string): number {
  const anchor = narrative.semanticIndex.anchors.find((candidate) => candidate.id === anchorId);
  if (anchor === undefined) throw new Error(`${owner} names unknown semantic anchor ${anchorId}`);
  if (anchor.kind === "program-start") return 0;
  if (anchor.kind === "program-end") return narrative.tokens.length;
  const segment = narrative.segments.find((candidate) => candidate.id === anchor.segmentId);
  if (segment === undefined) throw new Error(`${owner} names an anchor outside its Segment`);
  if (anchor.kind === "segment-start") return segment.tokenStart;
  if (anchor.kind === "segment-end") return segment.tokenEndExclusive;
  const tokenIndex = narrative.tokens.findIndex((token) => token.id === anchor.tokenId);
  if (tokenIndex < 0) throw new Error(`${owner} names an anchor without a Narrative token`);
  return anchor.kind === "token-start" ? tokenIndex : tokenIndex + 1;
}

/** Project a semantic Selection to complete authored N:M Caption units. */
export function captionUnitsForSelection(
  document: CaptionDocument,
  narrative: Narrative,
  selection: NarrativeSelection,
): CaptionUnitSubset {
  assertCaptionDocument(document);
  const start = tokenBoundary(narrative, selection.startAnchorId, `Selection ${selection.id}`);
  const end = tokenBoundary(narrative, selection.endAnchorId, `Selection ${selection.id}`);
  assert(end >= start, `Selection ${selection.id} is backwards`);
  const tokenPositions = new Map(narrative.tokens.map((token, index) => [token.id, index]));
  const unitIds: string[] = [];
  for (const unit of document.units) {
    const positions = unit.sourceTokenIds.map((tokenId) => tokenPositions.get(tokenId));
    assert(positions.every((position): position is number => position !== undefined),
      `Caption unit ${unit.id} references a token outside Narrative`);
    const unitStart = Math.min(...positions as number[]);
    const unitEnd = Math.max(...positions as number[]) + 1;
    if (unitStart >= end || unitEnd <= start) continue;
    if (unitStart < start || unitEnd > end) {
      throw new Error(`Caption Selection ${selection.id} partially selects Alignment Unit ${unit.id}`);
    }
    unitIds.push(unit.id);
  }
  if (unitIds.length === 0) throw new Error(`Caption Selection ${selection.id} selects no complete display unit`);
  return { documentId: document.id, unitIds };
}

export function captionUnitsForRole(document: CaptionDocument, role: string): CaptionUnitSubset {
  assertCaptionDocument(document);
  const unitIds = document.units.filter((unit) => unit.role === role).map((unit) => unit.id);
  if (unitIds.length === 0) throw new Error(`Caption Role ${role} selects no display unit`);
  return { documentId: document.id, unitIds };
}

export function captionWordsForAttribute(document: CaptionDocument, attribute: string): readonly string[] {
  assertCaptionDocument(document);
  const name = attribute.trim();
  if (!name) throw new Error("Caption attribute name is empty");
  const wordIds = document.words
    .filter((word) => word.attributes.some((item) => item.name === name))
    .map((word) => word.id);
  if (wordIds.length === 0) throw new Error(`Caption attribute ${name} selects no display word`);
  return wordIds;
}

export function assertCaptionUnitSubset(value: CaptionUnitSubset, document: CaptionDocument): void {
  assertCaptionDocument(document);
  assert(value.documentId === document.id, "Caption unit subset belongs to another document");
  const known = new Set(document.units.map((unit) => unit.id));
  assert(value.unitIds.length > 0 && value.unitIds.every((id) => known.has(id)),
    "Caption unit subset contains an unknown unit");
  const order = new Map(document.units.map((unit, index) => [unit.id, index]));
  const indices = value.unitIds.map((id) => order.get(id)!);
  assert(indices.every((index, position) => position === 0 || index === indices[position - 1]! + 1),
    "Caption unit subset must be an ordered contiguous range");
}
