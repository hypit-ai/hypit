export function normalizeForAlignment(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
}

export function alignmentCharacters(value: string): string[] {
  return [...normalizeForAlignment(value)];
}

export function editDistance(left: readonly string[], right: readonly string[]): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current.push(Math.min(
        previous[rightIndex + 1]! + 1,
        current[rightIndex]! + 1,
        previous[rightIndex]! + (left[leftIndex] === right[rightIndex] ? 0 : 1),
      ));
    }
    previous = current;
  }
  return previous[right.length]!;
}

export type CharacterPair = {
  readonly sourceIndex: number;
  readonly evidenceIndex: number;
  readonly exact: boolean;
};

/** A deterministic Levenshtein backtrace. Diagonal steps win exact ties. */
export function alignCharacters(
  source: readonly string[],
  evidence: readonly string[],
): CharacterPair[] {
  const rows = Array.from({ length: source.length + 1 }, () =>
    Array<number>(evidence.length + 1).fill(0));
  for (let index = 0; index <= source.length; index += 1) rows[index]![0] = index;
  for (let index = 0; index <= evidence.length; index += 1) rows[0]![index] = index;
  for (let left = 1; left <= source.length; left += 1) {
    for (let right = 1; right <= evidence.length; right += 1) {
      rows[left]![right] = Math.min(
        rows[left - 1]![right]! + 1,
        rows[left]![right - 1]! + 1,
        rows[left - 1]![right - 1]! + (source[left - 1] === evidence[right - 1] ? 0 : 1),
      );
    }
  }

  const pairs: CharacterPair[] = [];
  let left = source.length;
  let right = evidence.length;
  while (left > 0 || right > 0) {
    if (
      left > 0
      && right > 0
      && rows[left]![right]
        === rows[left - 1]![right - 1]! + (source[left - 1] === evidence[right - 1] ? 0 : 1)
    ) {
      pairs.push({
        sourceIndex: left - 1,
        evidenceIndex: right - 1,
        exact: source[left - 1] === evidence[right - 1],
      });
      left -= 1;
      right -= 1;
      continue;
    }
    if (left > 0 && rows[left]![right] === rows[left - 1]![right]! + 1) {
      left -= 1;
      continue;
    }
    right -= 1;
  }
  return pairs.reverse();
}
