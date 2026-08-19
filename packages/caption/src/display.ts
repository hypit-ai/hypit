import type {
  CaptionCorrespondence,
  CaptionDisplaySequence,
  CaptionDisplayWord,
  CaptionDisplayWordSubset,
} from "@hypit/narrative";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertCaptionDisplaySequence(value: CaptionDisplaySequence): void {
  assert(value.id.length > 0,
    "CaptionDisplaySequence identity is invalid");
  assert(value.atoms.length > 0 && value.words.length > 0,
    "CaptionDisplaySequence is empty");
  const words = new Map<string, CaptionDisplayWord>();
  value.words.forEach((word) => {
    assert(word.id.length > 0 && !words.has(word.id),
      "Caption display-word identity is invalid or repeated");
    assert(word.atomId.length > 0 && word.segmentId.length > 0 && word.turnId.length > 0 && word.text.length > 0,
      `Caption display word ${word.id} context is invalid`);
    words.set(word.id, word);
  });
  const planned: string[] = [];
  const atomIds = new Set<string>();
  value.atoms.forEach((atom) => {
    assert(atom.id.length > 0 && !atomIds.has(atom.id),
      "Caption Atom identity is invalid or repeated");
    atomIds.add(atom.id);
    assert(atom.segmentId.length > 0 && atom.turnId.length > 0 && atom.wordIds.length > 0,
      `Caption Atom ${atom.id} context is invalid`);
    for (const wordId of atom.wordIds) {
      const word = words.get(wordId);
      assert(word !== undefined && word.atomId === atom.id,
        `Caption Atom ${atom.id} references a foreign display word`);
      assert(word.segmentId === atom.segmentId && word.turnId === atom.turnId && word.role === atom.role,
        `Caption Atom ${atom.id} disagrees with its display-word context`);
      planned.push(wordId);
    }
  });
  assert(planned.join("\0") === value.words.map((word) => word.id).join("\0"),
    "Caption Atoms do not partition their display words exactly once and in order");
}

export function assertCaptionCorrespondence(
  value: CaptionCorrespondence,
  sequence: CaptionDisplaySequence,
): void {
  assertCaptionDisplaySequence(sequence);
  assert(value.displaySequenceId === sequence.id,
  "CaptionCorrespondence belongs to another display sequence");
  assert(value.atoms.length === sequence.atoms.length,
    "CaptionCorrespondence does not cover the exact Atom sequence");
  const sourceIds = new Set<string>();
  value.atoms.forEach((mapping, index) => {
    assert(mapping.atomId === sequence.atoms[index]!.id && mapping.sourceTokenIds.length > 0,
      "CaptionCorrespondence changes Atom order or contains an empty speech range");
    for (const tokenId of mapping.sourceTokenIds) {
      assert(tokenId.length > 0 && !sourceIds.has(tokenId),
        `CaptionCorrespondence repeats speech token ${tokenId}`);
      sourceIds.add(tokenId);
    }
  });
}

export function assertCaptionDisplayWordSubset(
  value: CaptionDisplayWordSubset,
  sequence: CaptionDisplaySequence,
): void {
  assertCaptionDisplaySequence(sequence);
  assert(value.id.length > 0,
    "CaptionDisplayWordSubset identity is invalid");
  assert(value.sequenceId === sequence.id,
    `CaptionDisplayWordSubset ${value.id} belongs to another display sequence`);
  const positions = new Map(sequence.words.map((word, index) => [word.id, index]));
  let previous = -1;
  const seen = new Set<string>();
  for (const id of value.wordIds) {
    const position = positions.get(id);
    assert(position !== undefined && position > previous && !seen.has(id),
      `CaptionDisplayWordSubset ${value.id} is not an ordered subset of ${sequence.id}`);
    previous = position;
    seen.add(id);
  }
  const selected = new Set(value.wordIds);
  for (const atom of sequence.atoms) {
    const count = atom.wordIds.filter((id) => selected.has(id)).length;
    assert(count === 0 || count === atom.wordIds.length,
      `CaptionDisplayWordSubset ${value.id} splits indivisible Atom ${atom.id}`);
  }
}

/** Author-surface sugar for Role selection. The Program itself receives only the resolved subset. */
export function captionWordsForRole(
  sequence: CaptionDisplaySequence,
  role: string,
): CaptionDisplayWordSubset {
  assertCaptionDisplaySequence(sequence);
  const normalized = role.trim();
  assert(normalized.length > 0, "Caption Role is empty");
  return {

    id: `role:${normalized}`,
    sequenceId: sequence.id,
    wordIds: sequence.words.filter((word) => word.role === normalized).map((word) => word.id),
  };
}
