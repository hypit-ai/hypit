import type {
  CaptionWord,
  CaptionWordSequence,
  CaptionWordSubset,
  Narrative,
} from "@narratage/narrative";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertCaptionWordSequence(value: CaptionWordSequence): void {
  assert(value.contract === "svml.caption-word-sequence@1" && value.id.length > 0,
    "CaptionWordSequence identity is invalid");
  assert(value.words.length > 0, "CaptionWordSequence is empty");
  const ids = new Set<string>();
  value.words.forEach((word, index) => {
    assert(word.id.length > 0 && !ids.has(word.id) && word.index === index,
      "CaptionWord identity is invalid or repeated");
    ids.add(word.id);
    assert(word.regionId.length > 0 && word.segmentId.length > 0 && word.turnId.length > 0 && word.text.length > 0,
      `CaptionWord ${word.id} context is invalid`);
    assert(Number.isSafeInteger(word.displayStart) && Number.isSafeInteger(word.displayEnd)
      && word.displayStart >= 0 && word.displayEnd > word.displayStart,
    `CaptionWord ${word.id} display range is invalid`);
    assert(Number.isSafeInteger(word.sourceTokenStart) && Number.isSafeInteger(word.sourceTokenEndExclusive)
      && word.sourceTokenStart >= 0 && word.sourceTokenEndExclusive > word.sourceTokenStart,
    `CaptionWord ${word.id} source range is invalid`);
    assert(word.correspondence === "exact" || word.correspondence === "region-envelope",
      `CaptionWord ${word.id} correspondence is invalid`);
  });
}

export function assertCaptionWordSubset(value: CaptionWordSubset, sequence: CaptionWordSequence): void {
  assertCaptionWordSequence(sequence);
  assert(value.contract === "svml.caption-word-subset@1" && value.id.length > 0,
    "CaptionWordSubset identity is invalid");
  assert(value.sequenceId === sequence.id, `CaptionWordSubset ${value.id} belongs to another word sequence`);
  const positions = new Map(sequence.words.map((word) => [word.id, word.index]));
  let previous = -1;
  const seen = new Set<string>();
  for (const id of value.wordIds) {
    const position = positions.get(id);
    assert(position !== undefined && position > previous && !seen.has(id),
      `CaptionWordSubset ${value.id} is not an ordered subset of ${sequence.id}`);
    previous = position;
    seen.add(id);
  }
}

/** Author-surface sugar for Role selection. The Program itself receives only the resolved subset. */
export function captionWordsForRole(sequence: CaptionWordSequence, role: string): CaptionWordSubset {
  assertCaptionWordSequence(sequence);
  const normalized = role.trim();
  assert(normalized.length > 0, "Caption Role is empty");
  return {
    contract: "svml.caption-word-subset@1",
    id: `role:${normalized}`,
    sequenceId: sequence.id,
    wordIds: sequence.words.filter((word) => word.role === normalized).map((word) => word.id),
  };
}

export function displayTextForWords(
  narrative: Narrative,
  universe: readonly CaptionWord[],
  selected: readonly CaptionWord[],
): string {
  const byRegion = new Map<string, CaptionWord[]>();
  for (const word of selected) {
    const values = byRegion.get(word.regionId) ?? [];
    values.push(word);
    byRegion.set(word.regionId, values);
  }
  const parts: string[] = [];
  for (const region of narrative.captionProjection.regions) {
    const words = byRegion.get(region.id);
    if (words === undefined || words.length === 0) continue;
    const ordered = [...words].sort((left, right) => left.displayStart - right.displayStart);
    const all = universe
      .filter((word) => word.regionId === region.id)
      .sort((left, right) => left.displayStart - right.displayStart);
    const first = ordered[0]!;
    const last = ordered.at(-1)!;
    const after = all.find((word) => word.displayStart > last.displayStart);
    parts.push(region.display.slice(first.displayStart, after?.displayStart ?? region.display.length).trim());
  }
  return parts.join(" ").replace(/\s+/gu, " ").replace(/\s+([,.;:!?])/gu, "$1").trim();
}
