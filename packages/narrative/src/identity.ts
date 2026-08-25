import type {
  CaptionDocument,
  Narrative,
  NarrativeExcerpt,
  NarrativeMomentRef,
  NarrativeSelectionRef,
} from "./types.js";

function nonempty(value: string, subject: string): void {
  if (value.trim().length === 0) throw new Error(`${subject} must not be empty.`);
}

function unique(values: readonly string[], subject: string): Set<string> {
  const found = new Set<string>();
  for (const value of values) {
    nonempty(value, subject);
    if (found.has(value)) throw new Error(`${subject} repeats ${value}.`);
    found.add(value);
  }
  return found;
}

export function assertNarrativeIdentity(value: Narrative): void {
  nonempty(value.id, "Narrative id");
  if (value.segments.length === 0) throw new Error("Narrative must contain at least one Segment.");
  const segmentIds = unique(value.segments.map((item) => item.id), "Narrative Segment id");
  const tokenIds = unique(value.tokens.map((item) => item.id), "Narrative Token id");
  unique(value.turns.map((item) => item.id), "Narrative Turn id");
  unique(value.selections.map((item) => item.id), "Narrative Selection id");
  unique(value.moments.map((item) => item.id), "Narrative Moment id");
  const anchorIds = unique(value.semanticIndex.anchors.map((item) => item.id), "Narrative Anchor id");
  const anchors = value.semanticIndex.anchors;
  if (anchors[0]?.id !== "program:start" || anchors[0].kind !== "program-start"
    || anchors.at(-1)?.id !== "program:end" || anchors.at(-1)?.kind !== "program-end") {
    throw new Error("Narrative semantic anchors must begin and end with the Program boundaries.");
  }
  const anchorOrder = new Map(anchors.map((anchor, index) => [anchor.id, index] as const));
  let tokenCursor = 0;
  for (const segment of value.segments) {
    if (!Number.isSafeInteger(segment.tokenStart) || !Number.isSafeInteger(segment.tokenEndExclusive)
      || segment.tokenStart !== tokenCursor || segment.tokenEndExclusive <= segment.tokenStart
      || segment.tokenEndExclusive > value.tokens.length
      || !anchorIds.has(segment.startAnchorId) || !anchorIds.has(segment.endAnchorId)) {
      throw new Error(`Narrative Segment ${segment.id} has invalid token or Anchor boundaries.`);
    }
    for (let index = segment.tokenStart; index < segment.tokenEndExclusive; index += 1) {
      const token = value.tokens[index]!;
      if (token.segmentId !== segment.id || !tokenIds.has(token.id)
        || !anchorIds.has(token.startAnchorId) || !anchorIds.has(token.endAnchorId)
        || token.text.length === 0 || token.normalized.length === 0) {
        throw new Error(`Narrative Token ${token.id} disagrees with Segment ${segment.id}.`);
      }
    }
    tokenCursor = segment.tokenEndExclusive;
  }
  if (tokenCursor !== value.tokens.length) throw new Error("Narrative Segments must partition Tokens in order.");
  for (const turn of value.turns) {
    if (!segmentIds.has(turn.segmentId) || !Number.isSafeInteger(turn.tokenStart)
      || !Number.isSafeInteger(turn.tokenEndExclusive) || turn.tokenEndExclusive <= turn.tokenStart
      || turn.tokenStart < 0 || turn.tokenEndExclusive > value.tokens.length
      || value.tokens.slice(turn.tokenStart, turn.tokenEndExclusive).some((token) => token.segmentId !== turn.segmentId)) {
      throw new Error(`Narrative Turn ${turn.id} has invalid Token coverage.`);
    }
  }
  for (const selection of value.selections) {
    const start = anchorOrder.get(selection.startAnchorId);
    const end = anchorOrder.get(selection.endAnchorId);
    if (start === undefined || end === undefined || end < start) {
      throw new Error(`Narrative Selection ${selection.id} has invalid Anchor order.`);
    }
  }
  for (const moment of value.moments) {
    if (!anchorIds.has(moment.anchorId)) throw new Error(`Narrative Moment ${moment.id} names an unknown Anchor.`);
  }
}

export function assertNarrativeExcerptIdentity(value: NarrativeExcerpt): void {
  if (value.kind !== "segment") throw new Error("NarrativeExcerpt must be a Segment.");
  nonempty(value.narrativeId, "NarrativeExcerpt narrativeId");
  nonempty(value.id, "NarrativeExcerpt id");
  if (!Number.isSafeInteger(value.tokenStart) || !Number.isSafeInteger(value.tokenEndExclusive)
    || value.tokenStart < 0 || value.tokenEndExclusive <= value.tokenStart) {
    throw new Error("NarrativeExcerpt Token coverage is invalid.");
  }
}

export function assertNarrativeSelectionRefIdentity(value: NarrativeSelectionRef): void {
  nonempty(value.narrativeId, "NarrativeSelection narrativeId");
  nonempty(value.id, "NarrativeSelection id");
  nonempty(value.startAnchorId, "NarrativeSelection startAnchorId");
  nonempty(value.endAnchorId, "NarrativeSelection endAnchorId");
}

export function assertNarrativeMomentRefIdentity(value: NarrativeMomentRef): void {
  nonempty(value.narrativeId, "NarrativeMoment narrativeId");
  nonempty(value.id, "NarrativeMoment id");
  nonempty(value.anchorId, "NarrativeMoment anchorId");
}

export function assertCaptionDocumentIdentity(value: CaptionDocument): void {
  nonempty(value.narrativeId, "CaptionDocument narrativeId");
  nonempty(value.id, "CaptionDocument id");
  if (value.units.length === 0 || value.words.length === 0) throw new Error("CaptionDocument is empty.");
  const unitIds = unique(value.units.map((item) => item.id), "CaptionDocument unit id");
  const wordIds = unique(value.words.map((item) => item.id), "CaptionDocument word id");
  const words = new Map(value.words.map((word) => [word.id, word] as const));
  const orderedWords: string[] = [];
  for (const unit of value.units) {
    if (unit.wordIds.length === 0 || unit.sourceTokenIds.length === 0) {
      throw new Error(`Caption unit ${unit.id} is empty.`);
    }
    for (const wordId of unit.wordIds) {
      const word = words.get(wordId);
      if (word === undefined || word.unitId !== unit.id || word.segmentId !== unit.segmentId
        || word.turnId !== unit.turnId || word.role !== unit.role) {
        throw new Error(`Caption unit ${unit.id} references a foreign word.`);
      }
      orderedWords.push(wordId);
    }
  }
  if (orderedWords.length !== wordIds.size
    || orderedWords.some((id, index) => id !== value.words[index]?.id)) {
    throw new Error("CaptionDocument units must partition words in order.");
  }
  unique(value.cueBreaks.map((item) => item.afterUnitId), "CaptionDocument Cue Break");
  if (value.cueBreaks.some((item) => !unitIds.has(item.afterUnitId))) {
    throw new Error("CaptionDocument Cue Break names an unknown unit.");
  }
}
