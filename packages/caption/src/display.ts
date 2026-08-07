import type { CaptionRegion, Narrative, NarrativeSelectionRef } from "@narratage/narrative";

import type { CaptionDisplayAtom } from "./types.js";

const WORD =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]\p{M}*|[\p{L}\p{M}\p{N}]+(?:['’.-][\p{L}\p{M}\p{N}]+)*/gu;

function displayWords(value: string): Array<{ readonly text: string; readonly start: number; readonly end: number }> {
  const result: Array<{ text: string; start: number; end: number }> = [];
  WORD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD.exec(value))) {
    result.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return result;
}

function turnForRegion(narrative: Narrative, region: CaptionRegion): Narrative["turns"][number] {
  const turn = narrative.turns.find((candidate) =>
    candidate.segmentId === region.segmentId
    && candidate.tokenStart < region.endTokenExclusive
    && candidate.tokenEndExclusive > region.startToken);
  if (turn === undefined) throw new Error(`Caption region ${region.id} is not owned by a Narrative Turn`);
  return turn;
}

/** The only word universe visible to Caption planning. Speech-side alias text never enters it. */
export function captionDisplayAtoms(narrative: Narrative): CaptionDisplayAtom[] {
  const atoms: CaptionDisplayAtom[] = [];
  for (const region of narrative.captionProjection.regions) {
    if (region.kind === "hidden") continue;
    const turn = turnForRegion(narrative, region);
    for (const word of displayWords(region.display)) {
      const exact = region.refinements.find((refinement) =>
        refinement.displayStart === word.start && refinement.displayEnd === word.end);
      atoms.push({
        id: `${region.id}:display:${atoms.length + 1}`,
        index: atoms.length,
        regionId: region.id,
        segmentId: region.segmentId,
        turnId: turn.id,
        ...(turn.role === undefined ? {} : { role: turn.role }),
        text: word.text,
        displayStart: word.start,
        displayEnd: word.end,
        sourceTokenStart: exact?.startToken ?? region.startToken,
        sourceTokenEndExclusive: exact?.endTokenExclusive ?? region.endTokenExclusive,
        correspondence: exact === undefined ? "region-envelope" : "exact",
      });
    }
  }
  if (atoms.length === 0) throw new Error("Caption display projection contains no visible words");
  return atoms;
}

function occurrenceRange(
  occurrence: NarrativeSelectionRef["occurrences"][number],
  tokenCount: number,
): { readonly start: number; readonly endExclusive: number } {
  // Outward affinity moves the boundary in time, not in words: `~@x hello @/x~`
  // and `@x hello @/x` cover the same token, differing only in the surrounding
  // silence they absorb.
  return {
    start: Math.max(0, occurrence.open.boundary.tokenIndex),
    endExclusive: Math.min(tokenCount, occurrence.close.boundary.tokenIndex),
  };
}

export function displayAtomMatchesSelection(
  atom: CaptionDisplayAtom,
  selection: NarrativeSelectionRef,
  tokenCount: number,
): boolean {
  return selection.occurrences.some((occurrence) => {
    const range = occurrenceRange(occurrence, tokenCount);
    return atom.sourceTokenStart < range.endExclusive && atom.sourceTokenEndExclusive > range.start;
  });
}

export function displayTextForAtoms(
  narrative: Narrative,
  selected: readonly CaptionDisplayAtom[],
): string {
  const byRegion = new Map<string, CaptionDisplayAtom[]>();
  for (const atom of selected) {
    const values = byRegion.get(atom.regionId) ?? [];
    values.push(atom);
    byRegion.set(atom.regionId, values);
  }
  const parts: string[] = [];
  for (const region of narrative.captionProjection.regions) {
    const atoms = byRegion.get(region.id);
    if (atoms === undefined || atoms.length === 0) continue;
    const ordered = [...atoms].sort((left, right) => left.displayStart - right.displayStart);
    const all = displayWords(region.display);
    const first = ordered[0]!;
    const last = ordered.at(-1)!;
    const after = all.find((word) => word.start > last.displayStart);
    parts.push(region.display.slice(first.displayStart, after?.start ?? region.display.length).trim());
  }
  return parts.join(" ").replace(/\s+/gu, " ").replace(/\s+([,.;:!?])/gu, "$1").trim();
}
