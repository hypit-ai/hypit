import type { Narrative, NarrativeToken } from "@hypit/narrative";
import type { TimedTranscript } from "@hypit/timed-transcript";

import { alignWordGroups } from "./align.js";
import { SpeechAlignmentError } from "./error.js";
import type { AlignmentGroup, NarrativeAlignmentTiming, TimedSpeechSegment } from "./types.js";

export type LocalTimedSpeechToken = NarrativeAlignmentTiming["tokens"][number];
export type LocalSemanticTimePoint = NarrativeAlignmentTiming["boundaries"][number];
export type LocalSemanticTiming = NarrativeAlignmentTiming;

/** Package-private exact grid used only while materializing NarrativeAlignment. */
export type AlignmentBasis = {
  readonly timeBase: { readonly numerator: number; readonly denominator: number };
  readonly unitCount: number;
  readonly segments: readonly [{
    readonly segmentId: string;
    readonly startUnit: 0;
    readonly endUnitExclusive: number;
  }];
};

type EvidenceWord = {
  readonly text: string;
  readonly start?: number;
  readonly end?: number;
};

type MutableTiming = { startUnit: number; endUnitExclusive: number };

function fail(code: string, message: string): never {
  throw new SpeechAlignmentError(code, message);
}

function validateBasis(narrative: Narrative, basis: AlignmentBasis): void {
  const { numerator, denominator } = basis.timeBase;
  if (!Number.isSafeInteger(numerator) || numerator <= 0
    || !Number.isSafeInteger(denominator) || denominator <= 0
    || !Number.isSafeInteger(basis.unitCount) || basis.unitCount < 1) {
    fail("SPEECH_GRID", "Speech alignment time grid is invalid.");
  }
  const [segment] = basis.segments;
  if (narrative.segments.length !== 1 || basis.segments.length !== 1
    || segment === undefined || segment.segmentId !== narrative.segments[0]!.id
    || segment.startUnit !== 0 || segment.endUnitExclusive !== basis.unitCount) {
    fail("SPEECH_BASIS_SEGMENTS", "Speech alignment requires one authored Segment covering its local domain.");
  }
}

function secondToUnit(second: number, basis: AlignmentBasis, side: "start" | "end"): number {
  if (!Number.isFinite(second) || second < 0) fail("SPEECH_WINDOW", "Transcript contains an invalid second boundary.");
  const units = second * basis.timeBase.denominator / basis.timeBase.numerator;
  const rounded = side === "start" ? Math.floor(units + 1e-9) : Math.ceil(units - 1e-9);
  return Math.max(0, Math.min(basis.unitCount, rounded));
}

function evidenceWords(transcript: TimedTranscript, basis: AlignmentBasis): EvidenceWord[] {
  const duration = basis.unitCount * basis.timeBase.numerator / basis.timeBase.denominator;
  const words = transcript.word_segments.map(({ word, start, end }): EvidenceWord => {
    if ((start === undefined) !== (end === undefined)) fail("SPEECH_WINDOW", `Transcript word ${word} has a partial time range.`);
    if (start !== undefined && (start > end! || end! > duration + 1e-9)) {
      fail("SPEECH_WINDOW", `Transcript word ${word} lies outside the alignment domain.`);
    }
    return { text: word, ...(start === undefined ? {} : { start, end }) };
  });
  for (const segment of transcript.segments) {
    if (segment.start > segment.end || segment.end > duration + 1e-9) {
      fail("SPEECH_WINDOW", "Transcript segment lies outside the alignment domain.");
    }
  }
  return words;
}

function groupWindow(group: AlignmentGroup, words: readonly EvidenceWord[], basis: AlignmentBasis): MutableTiming | undefined {
  const timed = words.slice(group.evidenceWordStart, group.evidenceWordEndExclusive)
    .filter((word): word is EvidenceWord & { start: number; end: number } => word.start !== undefined && word.end !== undefined);
  if (timed.length === 0) return undefined;
  const startUnit = secondToUnit(Math.min(...timed.map((word) => word.start)), basis, "start");
  const endUnitExclusive = secondToUnit(Math.max(...timed.map((word) => word.end)), basis, "end");
  return endUnitExclusive > startUnit ? { startUnit, endUnitExclusive } : undefined;
}

function tokenWeights(tokens: readonly NarrativeToken[]): readonly number[] {
  return tokens.map((token) => Math.max(1, [...token.normalized].length));
}

function distribute(window: MutableTiming, tokens: readonly NarrativeToken[]): MutableTiming[] {
  const weights = tokenWeights(tokens);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let consumed = 0;
  return weights.map((weight) => {
    const startUnit = window.startUnit + Math.round((window.endUnitExclusive - window.startUnit) * consumed / total);
    consumed += weight;
    const endUnitExclusive = window.startUnit
      + Math.round((window.endUnitExclusive - window.startUnit) * consumed / total);
    return { startUnit, endUnitExclusive: Math.max(startUnit + 1, endUnitExclusive) };
  });
}

function locateGroup(
  group: AlignmentGroup,
  source: readonly NarrativeToken[],
  words: readonly EvidenceWord[],
  basis: AlignmentBasis,
  output: Array<MutableTiming | undefined>,
): void {
  if (group.sourceTokenIds.length === 0 || group.evidenceWordStart === group.evidenceWordEndExclusive) return;
  const indexById = new Map(source.map((token, index) => [token.id, index]));
  const tokens = group.sourceTokenIds.map((id) => source[indexById.get(id)!]!);
  const window = groupWindow(group, words, basis);
  if (window === undefined) return;
  for (const [index, timing] of distribute(window, tokens).entries()) output[indexById.get(tokens[index]!.id)!] = timing;
}

function fillMissing(
  values: Array<MutableTiming | undefined>,
  source: readonly NarrativeToken[],
  startBound: number,
  endBound: number,
): MutableTiming[] {
  let cursor = 0;
  while (cursor < values.length) {
    if (values[cursor] !== undefined) { cursor += 1; continue; }
    const runStart = cursor;
    while (cursor < values.length && values[cursor] === undefined) cursor += 1;
    const runEnd = cursor;
    const left = runStart === 0 ? startBound : values[runStart - 1]!.endUnitExclusive;
    const right = runEnd === values.length ? endBound : values[runEnd]!.startUnit;
    const generated = distribute({ startUnit: left, endUnitExclusive: Math.max(left + 1, right) }, source.slice(runStart, runEnd));
    for (const [offset, timing] of generated.entries()) values[runStart + offset] = timing;
  }
  return values as MutableTiming[];
}

/** Locate authored tokens from one final TimedTranscript without retaining recognizer internals. */
export function locateAlignedSegmentTiming(
  narrative: Narrative,
  basis: AlignmentBasis,
  transcript: TimedTranscript,
): LocalSemanticTiming {
  validateBasis(narrative, basis);
  const words = evidenceWords(transcript, basis);
  const segment = narrative.segments[0]!;
  const source = narrative.tokens.slice(segment.tokenStart, segment.tokenEndExclusive);
  const groups = alignWordGroups(segment.id, source, words);
  const located: Array<MutableTiming | undefined> = Array(source.length).fill(undefined);
  for (const group of groups) locateGroup(group, source, words, basis, located);
  const complete = fillMissing(located, source, 0, basis.unitCount);
  let previousStart = 0;
  let previousEnd = 0;
  const timedTokens = source.map((token, index): LocalTimedSpeechToken => {
    const timing = complete[index]!;
    const startUnit = Math.max(timing.startUnit, previousStart);
    const endUnitExclusive = Math.min(basis.unitCount,
      Math.max(timing.endUnitExclusive, previousEnd, startUnit + 1));
    previousStart = startUnit;
    previousEnd = endUnitExclusive;
    return { tokenId: token.id, segmentId: segment.id, startUnit, endUnitExclusive };
  });
  const timedSegments: TimedSpeechSegment[] = [{
    segmentId: segment.id,
    startUnit: 0,
    endUnitExclusive: basis.unitCount,
  }];
  const tokensById = new Map(timedTokens.map((token) => [token.tokenId, token]));
  const boundaries: LocalSemanticTimePoint[] = narrative.anchors.flatMap((anchor): LocalSemanticTimePoint[] => {
    if (anchor.kind === "segment-start") return [{ id: anchor.id, unit: timedSegments[0]!.startUnit }];
    if (anchor.kind === "segment-end") return [{ id: anchor.id, unit: timedSegments[0]!.endUnitExclusive }];
    const token = tokensById.get(anchor.tokenId!);
    if (token === undefined) fail("SPEECH_TOKEN", `Transcript did not locate Token ${anchor.tokenId}.`);
    return [{ id: anchor.id, unit: anchor.kind === "token-start" ? token.startUnit : token.endUnitExclusive }];
  });
  return { timeBase: { ...basis.timeBase }, tokens: timedTokens, boundaries };
}
