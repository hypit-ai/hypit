import { assertCaptionDocument } from "@hypit/caption";
import type { CaptionDocument } from "@hypit/caption";
import { narrativeSelectionTokenRange } from "@hypit/narrative";
import type { Narrative, NarrativeSelection } from "@hypit/narrative";

import type { NarrativeCaptionBinding, NarrativeCaptionUnitSubset } from "./types.js";

/** Project one Narrative Selection to complete authored N:M Caption units. */
export function captionUnitsForNarrativeSelection(
  document: CaptionDocument,
  binding: NarrativeCaptionBinding,
  narrative: Narrative,
  selection: NarrativeSelection,
): NarrativeCaptionUnitSubset {
  assertCaptionDocument(document);
  if (binding.documentId !== document.id || binding.narrativeId !== narrative.id) {
    throw new Error("NarrativeCaptionBinding disagrees with its document or Narrative.");
  }
  const { tokenStart: start, tokenEndExclusive: end } = narrativeSelectionTokenRange(narrative, selection);
  const tokenPositions = new Map(narrative.tokens.map((token, index) => [token.id, index]));
  const bound = new Map(binding.units.map((unit) => [unit.unitId, unit.sourceTokenIds] as const));
  const unitIds: string[] = [];
  for (const unit of document.units) {
    const positions = (bound.get(unit.id) ?? []).map((tokenId) => tokenPositions.get(tokenId));
    if (!positions.every((position): position is number => position !== undefined)) {
      throw new Error(`Caption unit ${unit.id} references a token outside Narrative`);
    }
    const unitStart = Math.min(...positions);
    const unitEnd = Math.max(...positions) + 1;
    if (unitStart >= end || unitEnd <= start) continue;
    if (unitStart < start || unitEnd > end) {
      throw new Error(`Caption Selection ${selection.id} partially selects Alignment Unit ${unit.id}`);
    }
    unitIds.push(unit.id);
  }
  if (unitIds.length === 0) throw new Error(`Caption Selection ${selection.id} selects no complete display unit`);
  return { documentId: document.id, unitIds };
}
