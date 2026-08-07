import type { NarrativeToken } from "@narratage/narrative";
import type { SpeechWordEvidence } from "@narratage/speech-evidence";
import type { AlignmentGroup, AlignmentRelation } from "@narratage/semantic-map";

import { editDistance, normalizeForAlignment } from "./normalize.js";

const EPSILON = 1e-9;
const DEFAULT_MAX_GROUP = 4;

type Cell = {
  readonly cost: number;
  readonly exactTokens: number;
  readonly omissions: number;
  readonly insertions: number;
  readonly complexity: number;
  readonly previousSource: number;
  readonly previousEvidence: number;
  readonly group: AlignmentGroup;
};

function comparisonText(values: readonly { readonly text: string }[]): string {
  return values.map((value) => normalizeForAlignment(value.text)).join("");
}

function evidenceReliability(words: readonly SpeechWordEvidence[]): number {
  const scores = words
    .map((word) => word.score)
    .filter((score): score is number => score !== undefined && Number.isFinite(score));
  if (!scores.length) return 0.8;
  const average = scores.reduce((sum, score) => sum + Math.max(0, Math.min(1, score)), 0) / scores.length;
  return 0.5 + 0.5 * average;
}

function exactWordLcs(
  source: readonly NarrativeToken[],
  evidence: readonly SpeechWordEvidence[],
): number {
  const rows = Array.from({ length: source.length + 1 }, () =>
    Array<number>(evidence.length + 1).fill(0));
  for (let left = source.length - 1; left >= 0; left -= 1) {
    for (let right = evidence.length - 1; right >= 0; right -= 1) {
      rows[left]![right] = source[left]!.normalized === normalizeForAlignment(evidence[right]!.text)
        ? rows[left + 1]![right + 1]! + 1
        : Math.max(rows[left + 1]![right]!, rows[left]![right + 1]!);
    }
  }
  return rows[0]![0]!;
}

function relation(
  sourceCount: number,
  evidenceCount: number,
  exactOneToOne: boolean,
): AlignmentRelation {
  if (sourceCount === 0) return "evidence-insertion";
  if (evidenceCount === 0) return "source-omission";
  if (sourceCount === 1 && evidenceCount === 1 && exactOneToOne) return "exact";
  if (sourceCount > 1 && evidenceCount === 1) return "merge";
  if (sourceCount === 1 && evidenceCount > 1) return "split";
  return "replacement";
}

function pairedCost(
  source: readonly NarrativeToken[],
  evidence: readonly SpeechWordEvidence[],
): number {
  const sourceText = comparisonText(source);
  const evidenceText = comparisonText(evidence);
  const width = Math.max([...sourceText].length, [...evidenceText].length, 1);
  const distance = editDistance([...sourceText], [...evidenceText]) / width;
  const grouping = 0.055 * Math.max(0, source.length + evidence.length - 2);
  const exactWords = exactWordLcs(source, evidence);
  const unmatchedWordBoundaries = source.length + evidence.length - 2 * exactWords;
  return distance * evidenceReliability(evidence) + grouping + 0.06 * unmatchedWordBoundaries;
}

function better(candidate: Cell, current: Cell | undefined): boolean {
  if (!current) return true;
  if (candidate.cost < current.cost - EPSILON) return true;
  if (candidate.cost > current.cost + EPSILON) return false;
  if (candidate.exactTokens !== current.exactTokens) return candidate.exactTokens > current.exactTokens;
  if (candidate.omissions !== current.omissions) return candidate.omissions < current.omissions;
  if (candidate.insertions !== current.insertions) return candidate.insertions < current.insertions;
  return candidate.complexity < current.complexity;
}

function extend(
  previous: Cell | undefined,
  group: AlignmentGroup,
  sourceCount: number,
  evidenceCount: number,
  exactTokens: number,
): Cell {
  return {
    cost: (previous?.cost ?? 0) + group.cost,
    exactTokens: (previous?.exactTokens ?? 0) + exactTokens,
    omissions: (previous?.omissions ?? 0) + (evidenceCount === 0 ? sourceCount : 0),
    insertions: (previous?.insertions ?? 0) + (sourceCount === 0 ? evidenceCount : 0),
    complexity: (previous?.complexity ?? 0) + Math.max(0, sourceCount + evidenceCount - 2),
    previousSource: 0,
    previousEvidence: 0,
    group,
  };
}

export function alignWordGroups(
  sourceSegmentId: string,
  source: readonly NarrativeToken[],
  evidence: readonly SpeechWordEvidence[],
  maxGroupSize = DEFAULT_MAX_GROUP,
): AlignmentGroup[] {
  const rows = Array.from({ length: source.length + 1 }, () =>
    Array<Cell | undefined>(evidence.length + 1).fill(undefined));
  rows[0]![0] = {
    cost: 0,
    exactTokens: 0,
    omissions: 0,
    insertions: 0,
    complexity: 0,
    previousSource: -1,
    previousEvidence: -1,
    group: {
      sourceSegmentId,
      sourceTokenIds: [],
      evidenceWordStart: 0,
      evidenceWordEndExclusive: 0,
      relation: "exact",
      cost: 0,
    },
  };

  const update = (
    sourceIndex: number,
    evidenceIndex: number,
    nextSource: number,
    nextEvidence: number,
    group: AlignmentGroup,
    exactTokens: number,
  ): void => {
    const previous = rows[sourceIndex]![evidenceIndex];
    if (!previous) return;
    const candidate = {
      ...extend(
        sourceIndex === 0 && evidenceIndex === 0 ? undefined : previous,
        group,
        nextSource - sourceIndex,
        nextEvidence - evidenceIndex,
        exactTokens,
      ),
      previousSource: sourceIndex,
      previousEvidence: evidenceIndex,
    };
    if (better(candidate, rows[nextSource]![nextEvidence])) {
      rows[nextSource]![nextEvidence] = candidate;
    }
  };

  for (let sourceIndex = 0; sourceIndex <= source.length; sourceIndex += 1) {
    for (let evidenceIndex = 0; evidenceIndex <= evidence.length; evidenceIndex += 1) {
      if (!rows[sourceIndex]![evidenceIndex]) continue;
      for (let sourceCount = 1; sourceCount <= maxGroupSize && sourceIndex + sourceCount <= source.length; sourceCount += 1) {
        for (let evidenceCount = 1; evidenceCount <= maxGroupSize && evidenceIndex + evidenceCount <= evidence.length; evidenceCount += 1) {
          const sourceGroup = source.slice(sourceIndex, sourceIndex + sourceCount);
          const evidenceGroup = evidence.slice(evidenceIndex, evidenceIndex + evidenceCount);
          const exactOneToOne = sourceCount === 1
            && evidenceCount === 1
            && sourceGroup[0]!.normalized === normalizeForAlignment(evidenceGroup[0]!.text);
          const cost = pairedCost(sourceGroup, evidenceGroup);
          update(
            sourceIndex,
            evidenceIndex,
            sourceIndex + sourceCount,
            evidenceIndex + evidenceCount,
            {
              sourceSegmentId,
              sourceTokenIds: sourceGroup.map((token) => token.id),
              evidenceWordStart: evidenceIndex,
              evidenceWordEndExclusive: evidenceIndex + evidenceCount,
              relation: relation(sourceCount, evidenceCount, exactOneToOne),
              cost,
            },
            exactOneToOne ? 1 : 0,
          );
        }
      }
      if (sourceIndex < source.length) {
        const token = source[sourceIndex]!;
        update(
          sourceIndex,
          evidenceIndex,
          sourceIndex + 1,
          evidenceIndex,
          {
            sourceSegmentId,
            sourceTokenIds: [token.id],
            evidenceWordStart: evidenceIndex,
            evidenceWordEndExclusive: evidenceIndex,
            relation: "source-omission",
            cost: 0.5,
          },
          0,
        );
      }
      if (evidenceIndex < evidence.length) {
        update(
          sourceIndex,
          evidenceIndex,
          sourceIndex,
          evidenceIndex + 1,
          {
            sourceSegmentId,
            sourceTokenIds: [],
            evidenceWordStart: evidenceIndex,
            evidenceWordEndExclusive: evidenceIndex + 1,
            relation: "evidence-insertion",
            cost: 0.35,
          },
          0,
        );
      }
    }
  }

  const groups: AlignmentGroup[] = [];
  let sourceIndex = source.length;
  let evidenceIndex = evidence.length;
  while (sourceIndex > 0 || evidenceIndex > 0) {
    const cell = rows[sourceIndex]![evidenceIndex];
    if (!cell) throw new Error("Word alignment failed to produce a complete path.");
    groups.push(cell.group);
    sourceIndex = cell.previousSource;
    evidenceIndex = cell.previousEvidence;
  }
  return groups.reverse();
}
