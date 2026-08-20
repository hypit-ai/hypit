import { isDigest } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";
import type { Narrative, NarrativeToken } from "@hypit/narrative";
import { programFrameSampleBoundary, programSpaceFrameCount } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import type {
  AlignedTranscriptEvidence,
  SpeechActivitySpan,
  SpeechCharacterEvidence,
  SpeechTranscriptPassage,
  SpeechWordEvidence,
} from "@hypit/speech-evidence";

import { alignWordGroups } from "./align.js";
import { SpeechAlignmentError } from "./error.js";
import { alignCharacters, alignmentCharacters } from "./normalize.js";
import type { AlignmentGroup, TimedSpeechSegment } from "./types.js";

export type LocalTimedSpeechToken = {
  readonly tokenId: string;
  readonly segmentId: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type LocalSemanticTimePoint = { readonly identity: string; readonly frame: number };

/** Private alignment result used only to materialize one SemanticTake. */
export type LocalSemanticTiming = {
  readonly tokens: readonly LocalTimedSpeechToken[];
  readonly anchors: readonly LocalSemanticTimePoint[];
};

/** Package-private clock used while aligning exactly one normalized Segment Take. */
export type AlignmentBasis = {
  readonly programSpace: ProgramSpace;
  readonly audio: BlobRef;
  readonly segments: readonly [{
    readonly segmentId: string;
    readonly startFrame: 0;
    readonly endFrameExclusive: number;
  }];
};

type MutableTiming = {
  startSample: number;
  endSampleExclusive: number;
};

type TimedEvidenceChar = {
  readonly value: string;
  readonly wordIndex: number;
  readonly startSample?: number;
  readonly endSampleExclusive?: number;
};

type SegmentEvidence = {
  readonly sourceSegmentId: string;
  readonly words: SpeechWordEvidence[];
  readonly chars: SpeechCharacterEvidence[];
  readonly speechActivity: SpeechActivitySpan[];
};

function fail(code: string, message: string): never {
  throw new SpeechAlignmentError(code, message);
}

function positiveSampleWindow(value: {
  readonly startSample?: number;
  readonly endSampleExclusive?: number;
}): value is { readonly startSample: number; readonly endSampleExclusive: number } {
  return value.startSample !== undefined
    && value.endSampleExclusive !== undefined
    && value.endSampleExclusive > value.startSample;
}

/** Raw provider measurements may overlap, collapse or run backwards; only unusable coordinates are rejected. */
function validateSampleWindow(
  value: { readonly startSample?: number; readonly endSampleExclusive?: number },
  limit: number,
  label: string,
): void {
  if ((value.startSample === undefined) !== (value.endSampleExclusive === undefined)) {
    fail("SPEECH_WINDOW", `${label} must provide both sample boundaries or neither.`);
  }
  if (value.startSample === undefined || value.endSampleExclusive === undefined) return;
  if (!Number.isSafeInteger(value.startSample) || !Number.isSafeInteger(value.endSampleExclusive)
    || value.startSample < 0 || value.endSampleExclusive < 0
    || value.startSample > limit || value.endSampleExclusive > limit) {
    fail("SPEECH_WINDOW", `${label} has an unusable sample window ${value.startSample}..${value.endSampleExclusive}.`);
  }
}

function evidenceSampleFrames(basis: AlignmentBasis): number {
  return programFrameSampleBoundary(
    basis.programSpace,
    programSpaceFrameCount(basis.programSpace),
    16_000,
  );
}

function validateBasis(narrative: Narrative, basis: AlignmentBasis): void {
  const { numerator, denominator } = basis.programSpace.frameRate;
  if (!Number.isSafeInteger(numerator) || numerator <= 0
    || !Number.isSafeInteger(denominator) || denominator <= 0) {
    fail("SPEECH_FRAME_RATE", "ProgramSpace frame rate must be a positive rational number.");
  }
  const frameCount = programSpaceFrameCount(basis.programSpace);
  if (basis.audio.kind !== "blob" || !isDigest(basis.audio.digest)
    || basis.audio.mediaType !== "audio/wav" || !Number.isSafeInteger(basis.audio.size) || basis.audio.size < 0) {
    fail("SPEECH_AUDIO_DIGEST", "Speech alignment audio BlobRef is invalid.");
  }
  if (narrative.segments.length !== 1 || basis.segments.length !== 1) {
    fail("SPEECH_BASIS_SEGMENTS", "Speech alignment accepts exactly one normalized Segment Take.");
  }
  let previousEnd = 0;
  for (const [index, segment] of basis.segments.entries()) {
    const expected = narrative.segments[index]!;
    if (segment.segmentId !== expected.id) {
      fail("SPEECH_BASIS_SEGMENTS", `Alignment Segment ${segment.segmentId} does not match ${expected.id}.`);
    }
    if (!Number.isSafeInteger(segment.startFrame) || !Number.isSafeInteger(segment.endFrameExclusive)
      || segment.startFrame !== previousEnd || segment.endFrameExclusive <= segment.startFrame
      || segment.endFrameExclusive > frameCount) {
      fail("SPEECH_BASIS_SEGMENTS", `Alignment Segment ${segment.segmentId} has an invalid frame window.`);
    }
    previousEnd = segment.endFrameExclusive;
  }
  if (previousEnd !== frameCount) {
    fail("SPEECH_BASIS_SEGMENTS", "Alignment Segments must cover ProgramSpace exactly.");
  }
}

function validateEvidence(basis: AlignmentBasis, evidence: AlignedTranscriptEvidence): void {
  const limit = evidenceSampleFrames(basis);
  for (const [passageIndex, passage] of evidence.passages.entries()) {
    validateSampleWindow(passage, limit, `Passage ${passageIndex + 1}`);
    for (const [wordIndex, word] of passage.words.entries()) {
      if (typeof word.text !== "string") fail("SPEECH_WORD_TEXT", `Word ${wordIndex + 1} has no text.`);
      validateSampleWindow(word, limit, `Word ${wordIndex + 1}`);
    }
    for (const [charIndex, char] of passage.chars.entries()) {
      if (!Number.isInteger(char.wordIndex) || char.wordIndex < 0 || char.wordIndex >= passage.words.length) {
        fail("SPEECH_CHAR_WORD", `Character ${charIndex + 1} has an invalid wordIndex.`);
      }
      validateSampleWindow(char, limit, `Character ${charIndex + 1}`);
    }
    for (const [spanIndex, span] of (passage.speechActivity ?? []).entries()) {
      validateSampleWindow(span, limit, `Speech activity span ${spanIndex + 1}`);
    }
  }
}

function sampleMidpoint(value: {
  readonly startSample?: number;
  readonly endSampleExclusive?: number;
}): number | undefined {
  return positiveSampleWindow(value)
    ? (value.startSample + value.endSampleExclusive) / 2
    : undefined;
}

/** Assign acoustic evidence to authored Segments only where both clocks are explicitly connected. */
function partitionEvidence(
  basis: AlignmentBasis,
  evidence: AlignedTranscriptEvidence,
): readonly SegmentEvidence[] {
  const ranges = basis.segments.map((segment) => ({
    segment,
    startSample: programFrameSampleBoundary(basis.programSpace, segment.startFrame, 16_000),
    endSampleExclusive: programFrameSampleBoundary(basis.programSpace, segment.endFrameExclusive, 16_000),
  }));
  const buckets = ranges.map(({ segment }) => ({
    sourceSegmentId: segment.segmentId,
    words: [] as SpeechWordEvidence[],
    chars: [] as SpeechCharacterEvidence[],
    speechActivity: [] as SpeechActivitySpan[],
  }));
  const bucketIndex = (point: number | undefined): number => {
    const measured = point ?? 0;
    const index = ranges.findIndex((range, rangeIndex) => measured >= range.startSample
      && (measured < range.endSampleExclusive || rangeIndex === ranges.length - 1));
    if (index >= 0) return index;
    return measured < ranges[0]!.startSample ? 0 : ranges.length - 1;
  };

  for (const passage of evidence.passages) {
    const passagePoint = sampleMidpoint(passage);
    for (const [wordIndex, word] of passage.words.entries()) {
      const target = buckets[bucketIndex(sampleMidpoint(word) ?? passagePoint)]!;
      const targetWordIndex = target.words.length;
      target.words.push(word);
      target.chars.push(...passage.chars
        .filter((char) => char.wordIndex === wordIndex)
        .map((char) => ({ ...char, wordIndex: targetWordIndex })));
    }
    for (const span of passage.speechActivity ?? []) {
      buckets[bucketIndex(sampleMidpoint(span) ?? passagePoint)]!.speechActivity.push(span);
    }
  }
  return buckets;
}

function interpolatedBoundary(start: number, end: number, index: number, count: number): number {
  return start + Math.round((end - start) * index / count);
}

function syntheticCharTimes(
  characters: readonly string[],
  wordIndex: number,
  word: SpeechWordEvidence,
): TimedEvidenceChar[] {
  const hasWindow = positiveSampleWindow(word);
  return characters.map((value, index) => ({
    value,
    wordIndex,
    ...(hasWindow
      ? {
          startSample: interpolatedBoundary(word.startSample, word.endSampleExclusive, index, characters.length),
          endSampleExclusive: interpolatedBoundary(
            word.startSample,
            word.endSampleExclusive,
            index + 1,
            characters.length,
          ),
        }
      : {}),
  }));
}

function timedCharsForWord(
  word: SpeechWordEvidence,
  wordIndex: number,
  rawChars: readonly SpeechCharacterEvidence[],
): TimedEvidenceChar[] {
  const expected = alignmentCharacters(word.text);
  if (!expected.length) return [];
  const supplied = rawChars
    .filter((char) => char.wordIndex === wordIndex)
    .flatMap((char) => alignmentCharacters(char.char).map((value) => ({
      value,
      wordIndex,
      ...(positiveSampleWindow(char)
        ? { startSample: char.startSample, endSampleExclusive: char.endSampleExclusive }
        : {}),
    })));
  if (!supplied.length) return syntheticCharTimes(expected, wordIndex, word);

  const fallback = syntheticCharTimes(expected, wordIndex, word);
  const pairs = alignCharacters(expected, supplied.map((char) => char.value));
  for (const pair of pairs) {
    const suppliedChar = supplied[pair.evidenceIndex]!;
    if (!positiveSampleWindow(suppliedChar)) continue;
    fallback[pair.sourceIndex] = {
      value: expected[pair.sourceIndex]!,
      wordIndex,
      startSample: suppliedChar.startSample,
      endSampleExclusive: suppliedChar.endSampleExclusive,
    };
  }
  return fallback;
}

function timedChars(segment: SegmentEvidence): TimedEvidenceChar[] {
  return segment.words.flatMap((word, index) => timedCharsForWord(word, index, segment.chars));
}

function scoredWords(segment: SegmentEvidence): SpeechWordEvidence[] {
  return segment.words.map((word, wordIndex) => {
    const scores = [
      ...(word.score === undefined ? [] : [word.score]),
      ...segment.chars
        .filter((char) => char.wordIndex === wordIndex && char.score !== undefined)
        .map((char) => char.score!),
    ];
    return scores.length
      ? { ...word, score: scores.reduce((sum, score) => sum + score, 0) / scores.length }
      : word;
  });
}

function groupWindow(
  group: AlignmentGroup,
  words: readonly SpeechWordEvidence[],
  chars: readonly TimedEvidenceChar[],
): MutableTiming | undefined {
  const wordRun = words.slice(group.evidenceWordStart, group.evidenceWordEndExclusive);
  const charRun = chars.filter((char) =>
    char.wordIndex >= group.evidenceWordStart && char.wordIndex < group.evidenceWordEndExclusive);
  const windows = [...wordRun, ...charRun].flatMap((item) => positiveSampleWindow(item)
    ? [{ startSample: item.startSample, endSampleExclusive: item.endSampleExclusive }]
    : []);
  if (!windows.length) return undefined;
  return {
    startSample: Math.min(...windows.map((item) => item.startSample)),
    endSampleExclusive: Math.max(...windows.map((item) => item.endSampleExclusive)),
  };
}

function locatePairedGroup(
  group: AlignmentGroup,
  source: readonly NarrativeToken[],
  words: readonly SpeechWordEvidence[],
  chars: readonly TimedEvidenceChar[],
  output: Array<MutableTiming | undefined>,
): void {
  if (!group.sourceTokenIds.length || group.evidenceWordStart === group.evidenceWordEndExclusive) return;
  const sourceIndexById = new Map(source.map((token, index) => [token.id, index]));
  const sourceRun = group.sourceTokenIds.map((id) => source[sourceIndexById.get(id)!]!);
  const sourceCharacters = sourceRun.flatMap((token, tokenOffset) =>
    [...token.normalized].map((value) => ({ value, tokenOffset })));
  const evidenceCharacters = chars.filter((char) =>
    char.wordIndex >= group.evidenceWordStart && char.wordIndex < group.evidenceWordEndExclusive);
  const pairs = alignCharacters(
    sourceCharacters.map((char) => char.value),
    evidenceCharacters.map((char) => char.value),
  );
  const window = groupWindow(group, words, chars);

  for (let tokenOffset = 0; tokenOffset < sourceRun.length; tokenOffset += 1) {
    const evidenceForToken = pairs
      .filter((pair) => sourceCharacters[pair.sourceIndex]!.tokenOffset === tokenOffset)
      .map((pair) => evidenceCharacters[pair.evidenceIndex]!)
      .filter(positiveSampleWindow);
    let startSample = evidenceForToken[0]?.startSample;
    let endSampleExclusive = evidenceForToken.at(-1)?.endSampleExclusive;
    if (sourceRun.length === 1 && window) {
      startSample = window.startSample;
      endSampleExclusive = window.endSampleExclusive;
    } else if (window) {
      if (tokenOffset === 0 && startSample !== undefined) startSample = window.startSample;
      if (tokenOffset === sourceRun.length - 1 && endSampleExclusive !== undefined) {
        endSampleExclusive = window.endSampleExclusive;
      }
    }
    if (startSample === undefined || endSampleExclusive === undefined
      || endSampleExclusive <= startSample) continue;
    const sourceIndex = sourceIndexById.get(sourceRun[tokenOffset]!.id)!;
    output[sourceIndex] = { startSample, endSampleExclusive };
  }
}

function speechBounds(
  basis: AlignmentBasis,
  segment: SegmentEvidence,
  basisSegment: AlignmentBasis["segments"][number],
): { readonly start: number; readonly end: number } {
  const spans = segment.speechActivity.filter(positiveSampleWindow);
  return spans.length
    ? {
        start: Math.min(...spans.map((span) => span.startSample)),
        end: Math.max(...spans.map((span) => span.endSampleExclusive)),
      }
    : {
        start: programFrameSampleBoundary(basis.programSpace, basisSegment.startFrame, 16_000),
        end: programFrameSampleBoundary(basis.programSpace, basisSegment.endFrameExclusive, 16_000),
      };
}

function fillMissingTiming(
  values: Array<MutableTiming | undefined>,
  source: readonly NarrativeToken[],
  startBound: number,
  endBound: number,
): MutableTiming[] {
  let cursor = 0;
  while (cursor < values.length) {
    if (values[cursor]) {
      cursor += 1;
      continue;
    }
    const runStart = cursor;
    while (cursor < values.length && !values[cursor]) cursor += 1;
    const runEnd = cursor;
    const left = runStart > 0 ? values[runStart - 1]!.endSampleExclusive : startBound;
    const right = runEnd < values.length ? values[runEnd]!.startSample : endBound;
    const usableRight = Math.max(left, right);
    const weights = source
      .slice(runStart, runEnd)
      .map((token) => Math.max(1, [...token.normalized].length));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let consumed = 0;
    for (let index = runStart; index < runEnd; index += 1) {
      const weight = weights[index - runStart]!;
      const startSample = interpolatedBoundary(left, usableRight, consumed, totalWeight);
      consumed += weight;
      const endSampleExclusive = interpolatedBoundary(left, usableRight, consumed, totalWeight);
      values[index] = { startSample, endSampleExclusive };
    }
  }
  return values as MutableTiming[];
}

function floorFrameForEvidenceSample(basis: AlignmentBasis, sample: number): number {
  const numerator = BigInt(sample) * BigInt(basis.programSpace.frameRate.numerator);
  const denominator = 16_000n * BigInt(basis.programSpace.frameRate.denominator);
  const frame = numerator / denominator;
  if (frame > BigInt(Number.MAX_SAFE_INTEGER)) fail("SPEECH_FRAME", "Speech evidence exceeds the frame domain.");
  return Number(frame);
}

function ceilFrameForEvidenceSample(basis: AlignmentBasis, sample: number): number {
  const numerator = BigInt(sample) * BigInt(basis.programSpace.frameRate.numerator);
  const denominator = 16_000n * BigInt(basis.programSpace.frameRate.denominator);
  const frame = (numerator + denominator - 1n) / denominator;
  if (frame > BigInt(Number.MAX_SAFE_INTEGER)) fail("SPEECH_FRAME", "Speech evidence exceeds the frame domain.");
  return Number(frame);
}

/** Project one completed sample timing onto every local video frame it touches. */
function projectSampleTiming(
  basis: AlignmentBasis,
  timing: MutableTiming,
): { readonly startFrame: number; readonly endFrameExclusive: number } {
  const frameCount = programSpaceFrameCount(basis.programSpace);
  const startFrame = Math.min(frameCount, floorFrameForEvidenceSample(basis, timing.startSample));
  const endFrameExclusive = Math.min(
    frameCount,
    ceilFrameForEvidenceSample(basis, timing.endSampleExclusive),
  );
  if (endFrameExclusive > startFrame) return { startFrame, endFrameExclusive };

  const containingFrame = Math.min(frameCount - 1, startFrame);
  return { startFrame: containingFrame, endFrameExclusive: containingFrame + 1 };
}

/** Locate every Script token from one provider-neutral acoustic evidence pass. */
export function locateAlignedSegmentTiming(
  narrative: Narrative,
  basis: AlignmentBasis,
  evidence: AlignedTranscriptEvidence,
): LocalSemanticTiming {
  validateBasis(narrative, basis);
  validateEvidence(basis, evidence);
  const evidenceBySegment = new Map(partitionEvidence(basis, evidence)
    .map((segment) => [segment.sourceSegmentId, segment]));
  const timedSegments: TimedSpeechSegment[] = [];
  const timedTokens: LocalTimedSpeechToken[] = [];

  for (const segment of narrative.segments) {
    const aligned = evidenceBySegment.get(segment.id)!;
    const source = narrative.tokens.slice(segment.tokenStart, segment.tokenEndExclusive);
    const segmentGroups = alignWordGroups(segment.id, source, scoredWords(aligned));
    const chars = timedChars(aligned);
    const located: Array<MutableTiming | undefined> = Array(source.length).fill(undefined);
    for (const group of segmentGroups) locatePairedGroup(group, source, aligned.words, chars, located);
    const basisSegment = basis.segments.find((item) => item.segmentId === segment.id)!;
    const bounds = speechBounds(basis, aligned, basisSegment);
    const complete = fillMissingTiming(located, source, bounds.start, bounds.end);
    timedTokens.push(...source.map((token, index): LocalTimedSpeechToken => {
      const timing = complete[index]!;
      const projected = projectSampleTiming(basis, timing);
      return {
        tokenId: token.id,
        segmentId: segment.id,
        ...projected,
      };
    }));
    timedSegments.push({
      segmentId: segment.id,
      startFrame: basisSegment.startFrame,
      endFrameExclusive: basisSegment.endFrameExclusive,
    });
  }

  const tokensById = new Map(timedTokens.map((token) => [token.tokenId, token]));
  const segmentsById = new Map(timedSegments.map((segment) => [segment.segmentId, segment]));
  const anchors: LocalSemanticTimePoint[] = narrative.semanticIndex.anchors.map((anchor) => {
    if (anchor.kind === "segment-start" || anchor.kind === "segment-end") {
      const segment = segmentsById.get(anchor.segmentId)!;
      return anchor.kind === "segment-start"
        ? { identity: anchor.id, frame: segment.startFrame }
        : { identity: anchor.id, frame: segment.endFrameExclusive };
    }
    const token = tokensById.get(anchor.tokenId!)!;
    return anchor.kind === "token-start"
      ? { identity: anchor.id, frame: token.startFrame }
      : { identity: anchor.id, frame: token.endFrameExclusive };
  });
  return { tokens: timedTokens, anchors };
}
