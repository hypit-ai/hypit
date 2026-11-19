const maxFuzzyGroup = 4;
// Fuzzy alignment retains a backtrace for each pair of prefixes.
const maxPrefixPairs = 1_000_000;
const costTolerance = 1e-9;

export function normalizeWord(word: string): string {
  return word.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
}

type WordMatch = {
  readonly authoredStart: number;
  readonly authoredEnd: number;
  readonly evidenceStart: number;
  readonly evidenceEnd: number;
};

type Cell = {
  readonly cost: number;
  readonly exact: number;
  readonly omitted: number;
  readonly inserted: number;
  readonly complexity: number;
  readonly previousAuthored: number;
  readonly previousEvidence: number;
};

function editDistance(left: readonly string[], right: readonly string[]): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (const [index, character] of left.entries()) {
    const current = [index + 1];
    for (const [column, other] of right.entries()) {
      current.push(Math.min(previous[column + 1]! + 1, current[column]! + 1,
        previous[column]! + (character === other ? 0 : 1)));
    }
    previous = current;
  }
  return previous[right.length]!;
}

function exactWordLcs(left: readonly string[], right: readonly string[]): number {
  let previous = Array<number>(right.length + 1).fill(0);
  for (const word of left) {
    const current = [0];
    for (const [column, other] of right.entries()) {
      current.push(word === other ? previous[column]! + 1 : Math.max(previous[column + 1]!, current[column]!));
    }
    previous = current;
  }
  return previous[right.length]!;
}

function pairedCost(authored: readonly string[], evidence: readonly string[]): number {
  const authoredText = authored.join("");
  const evidenceText = evidence.join("");
  const extraBoundaries = authored.length + evidence.length - 2;
  // Identical wording with different boundaries is a small segmentation difference.
  if (authoredText === evidenceText) return extraBoundaries === 0 ? 0 : 0.055;
  const left = [...authoredText];
  const right = [...evidenceText];
  const unmatched = authored.length + evidence.length - 2 * exactWordLcs(authored, evidence);
  return editDistance(left, right) / Math.max(left.length, right.length, 1)
    + 0.055 * extraBoundaries + 0.06 * unmatched;
}

function exactRunLength(target: string, parts: readonly string[], start: number): number {
  if (target.length === 0) return 0;
  let joined = "";
  for (let index = start; index < parts.length; index += 1) {
    joined += parts[index];
    if (joined === target) return index - start + 1;
    if (!target.startsWith(joined)) return 0;
  }
  return 0;
}

function better(candidate: Cell, current: Cell | undefined): boolean {
  if (current === undefined) return true;
  const difference = candidate.cost - current.cost;
  if (Math.abs(difference) > costTolerance) return difference < 0;
  if (candidate.exact !== current.exact) return candidate.exact > current.exact;
  if (candidate.omitted !== current.omitted) return candidate.omitted < current.omitted;
  if (candidate.inserted !== current.inserted) return candidate.inserted < current.inserted;
  return candidate.complexity < current.complexity;
}

/** Find monotone M:N groups between two normalized word lists. */
export function matchWords(authored: readonly string[], evidence: readonly string[]): readonly WordMatch[] {
  if (authored.length === 0 || evidence.length === 0) return [];
  if (authored.length === evidence.length && authored.every((word, index) => word === evidence[index])) {
    return authored.map((_, index) => ({
      authoredStart: index, authoredEnd: index + 1, evidenceStart: index, evidenceEnd: index + 1,
    }));
  }

  const stride = evidence.length + 1;
  const cellCount = (authored.length + 1) * stride;
  if (cellCount > maxPrefixPairs) {
    throw new Error("Transcript alignment window is too large for fuzzy matching. Pass shorter matching excerpts.");
  }
  const cells = new Array<Cell | undefined>(cellCount);
  cells[0] = { cost: 0, exact: 0, omitted: 0, inserted: 0, complexity: 0, previousAuthored: 0, previousEvidence: 0 };
  for (let i = 0; i <= authored.length; i += 1) {
    for (let j = 0; j <= evidence.length; j += 1) {
      const previous = cells[i * stride + j]!;
      function advance(authoredCount: number, evidenceCount: number, cost: number, exact = 0) {
        const index = (i + authoredCount) * stride + j + evidenceCount;
        const candidate: Cell = {
          cost: previous.cost + cost,
          exact: previous.exact + exact,
          omitted: previous.omitted + (evidenceCount === 0 ? authoredCount : 0),
          inserted: previous.inserted + (authoredCount === 0 ? evidenceCount : 0),
          complexity: previous.complexity + Math.max(0, authoredCount + evidenceCount - 2),
          previousAuthored: i,
          previousEvidence: j,
        };
        if (better(candidate, cells[index])) cells[index] = candidate;
      }
      function pair(authoredCount: number, evidenceCount: number) {
        const firstMatches = authored[i] === evidence[j];
        const lastMatches = authored[i + authoredCount - 1] === evidence[j + evidenceCount - 1];
        const single = authoredCount === 1 && evidenceCount === 1;
        // Leave a separable exact word available as its own timing anchor.
        if (!single && (firstMatches || lastMatches)) return;
        const exact = single && firstMatches;
        advance(authoredCount, evidenceCount, exact ? 0 : pairedCost(
          authored.slice(i, i + authoredCount), evidence.slice(j, j + evidenceCount),
        ), exact ? 1 : 0);
      }

      for (let left = 1; left <= Math.min(maxFuzzyGroup, authored.length - i); left += 1) {
        for (let right = 1; right <= Math.min(maxFuzzyGroup, evidence.length - j); right += 1) pair(left, right);
      }
      // Exact splits and merges may span more words than fuzzy alternatives.
      const evidenceRun = exactRunLength(authored[i] ?? "", evidence, j);
      if (evidenceRun > maxFuzzyGroup) pair(1, evidenceRun);
      const authoredRun = exactRunLength(evidence[j] ?? "", authored, i);
      if (authoredRun > maxFuzzyGroup) pair(authoredRun, 1);
      if (i < authored.length) advance(1, 0, 0.5);
      if (j < evidence.length) advance(0, 1, 0.35);
    }
  }

  const matches: WordMatch[] = [];
  let i = authored.length;
  let j = evidence.length;
  while (i > 0 || j > 0) {
    const { previousAuthored, previousEvidence } = cells[i * stride + j]!;
    if (previousAuthored < i && previousEvidence < j) {
      matches.push({ authoredStart: previousAuthored, authoredEnd: i, evidenceStart: previousEvidence, evidenceEnd: j });
    }
    i = previousAuthored;
    j = previousEvidence;
  }
  return matches.reverse();
}
