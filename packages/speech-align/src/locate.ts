import { digestOf, isDigest } from "@svml/protocol";
import type {
  AlignedTranscriptEvidence,
  AlignedTranscriptSegment,
  AlignmentGroup,
  CompleteSemanticMap,
  Narrative,
  NarrativeToken,
  SemanticTimePoint,
  SpeechAudioBasis,
  SpeechCharacterEvidence,
  SpeechWordEvidence,
  TimedSpeechSegment,
  TimedSpeechToken,
  TimingQuality,
} from "@svml/contracts";

import { alignWordGroups } from "./align.js";
import { SpeechAlignmentError } from "./error.js";
import { alignCharacters, alignmentCharacters } from "./normalize.js";

const EPSILON = 1e-6;
export const speechLocatorDigest = digestOf("@svml/speech-align/locate@1");

type MutableTiming = {
  startSec: number;
  endSec: number;
  startQuality: TimingQuality;
  endQuality: TimingQuality;
};

type TimedEvidenceChar = {
  readonly value: string;
  readonly wordIndex: number;
  readonly startSec?: number;
  readonly endSec?: number;
};

function fail(code: string, message: string): never {
  throw new SpeechAlignmentError(code, message);
}

function finite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

function validateWindow(start: number, end: number, limit: number, label: string): void {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end > limit + EPSILON) {
    fail("SPEECH_WINDOW", `${label} has invalid time window ${start}..${end}.`);
  }
}

function validateBasis(narrative: Narrative, basis: SpeechAudioBasis): void {
  if (basis.contract !== "svml.speech-audio-basis@1") {
    fail("SPEECH_BASIS_CONTRACT", "Unsupported SpeechAudioBasis contract.");
  }
  const { numerator, denominator } = basis.programSpace.frameRate;
  if (!Number.isSafeInteger(numerator) || numerator <= 0 || !Number.isSafeInteger(denominator) || denominator <= 0) {
    fail("SPEECH_FRAME_RATE", "ProgramSpace frame rate must be a positive rational number.");
  }
  if (
    !Number.isFinite(basis.programSpace.durationSec)
    || basis.programSpace.durationSec <= 0
    || Math.abs(basis.audio.durationSec - basis.programSpace.durationSec) > EPSILON
  ) {
    fail("SPEECH_BASIS_DURATION", "SpeechAudioBasis audio and ProgramSpace must have the same positive duration.");
  }
  if (!isDigest(basis.audio.digest)) fail("SPEECH_AUDIO_DIGEST", "SpeechBasis audio digest is invalid.");
  if (basis.segments.length !== narrative.segments.length) {
    fail("SPEECH_BASIS_SEGMENTS", "SpeechAudioBasis must cover every Narrative Segment exactly once.");
  }
  let previousEnd = 0;
  for (const [index, segment] of basis.segments.entries()) {
    const expected = narrative.segments[index]!;
    if (segment.segmentId !== expected.id) {
      fail("SPEECH_BASIS_SEGMENTS", `SpeechAudioBasis Segment ${segment.segmentId} does not match ${expected.id}.`);
    }
    validateWindow(segment.startSec, segment.endSec, basis.programSpace.durationSec, `Basis Segment ${segment.segmentId}`);
    if (segment.startSec < previousEnd - EPSILON) {
      fail("SPEECH_BASIS_SEGMENTS", `SpeechAudioBasis Segment ${segment.segmentId} overlaps its predecessor.`);
    }
    previousEnd = segment.endSec;
  }
}

function validateEvidence(
  narrative: Narrative,
  basis: SpeechAudioBasis,
  evidence: AlignedTranscriptEvidence,
): void {
  if (evidence.contract !== "svml.aligned-transcript-evidence@1") {
    fail("SPEECH_CONTRACT", `Unsupported aligned-transcript contract ${evidence.contract}.`);
  }
  if (!Number.isFinite(evidence.durationSec) || evidence.durationSec <= 0) {
    fail("SPEECH_DURATION", "Aligned-transcript duration must be positive and finite.");
  }
  if (Math.abs(evidence.durationSec - basis.programSpace.durationSec) > EPSILON) {
    fail("SPEECH_EVIDENCE_DURATION", "Aligned transcript duration differs from SpeechBasis.");
  }
  const expected = new Set(narrative.segments.map((segment) => segment.id));
  const seen = new Set<string>();
  for (const segment of evidence.segments) {
    if (!expected.has(segment.sourceSegmentId)) {
      fail("SPEECH_SEGMENT_UNKNOWN", `Aligned transcript references unknown Segment ${segment.sourceSegmentId}.`);
    }
    if (seen.has(segment.sourceSegmentId)) {
      fail("SPEECH_SEGMENT_DUPLICATE", `Aligned transcript repeats Segment ${segment.sourceSegmentId}.`);
    }
    seen.add(segment.sourceSegmentId);
    validateWindow(segment.startSec, segment.endSec, evidence.durationSec, `Segment ${segment.sourceSegmentId}`);
    let previousEnd = segment.startSec;
    for (const [index, word] of segment.words.entries()) {
      if (typeof word.text !== "string") fail("SPEECH_WORD_TEXT", `Word ${index + 1} has no text.`);
      if (finite(word.startSec) !== finite(word.endSec)) {
        fail("SPEECH_WORD_PARTIAL_TIME", `Word ${index + 1} must provide both start and end or neither.`);
      }
      if (finite(word.startSec) && finite(word.endSec)) {
        validateWindow(word.startSec, word.endSec, evidence.durationSec, `Word ${index + 1}`);
        if (
          word.startSec < segment.startSec - EPSILON
          || word.endSec > segment.endSec + EPSILON
          || word.startSec < previousEnd - EPSILON
        ) {
          fail("SPEECH_WORD_ORDER", `Word ${index + 1} is outside or overlaps its Segment window.`);
        }
        previousEnd = word.endSec;
      }
      if (word.score !== undefined && (!Number.isFinite(word.score) || word.score < 0 || word.score > 1)) {
        fail("SPEECH_SCORE", `Word ${index + 1} score must be between zero and one.`);
      }
    }
    for (const [index, char] of segment.chars.entries()) {
      if (!Number.isInteger(char.wordIndex) || char.wordIndex < 0 || char.wordIndex >= segment.words.length) {
        fail("SPEECH_CHAR_WORD", `Character ${index + 1} has an invalid wordIndex.`);
      }
      if (finite(char.startSec) !== finite(char.endSec)) {
        fail("SPEECH_CHAR_PARTIAL_TIME", `Character ${index + 1} must provide both start and end or neither.`);
      }
      if (finite(char.startSec) && finite(char.endSec)) {
        validateWindow(char.startSec, char.endSec, evidence.durationSec, `Character ${index + 1}`);
        const word = segment.words[char.wordIndex]!;
        if (
          char.startSec < segment.startSec - EPSILON
          || char.endSec > segment.endSec + EPSILON
          || (finite(word.startSec) && char.startSec < word.startSec - EPSILON)
          || (finite(word.endSec) && char.endSec > word.endSec + EPSILON)
        ) {
          fail("SPEECH_CHAR_WINDOW", `Character ${index + 1} falls outside its Word or Segment window.`);
        }
      }
      if (char.score !== undefined && (!Number.isFinite(char.score) || char.score < 0 || char.score > 1)) {
        fail("SPEECH_SCORE", `Character ${index + 1} score must be between zero and one.`);
      }
    }
    let previousVadEnd = segment.startSec;
    for (const [index, span] of (segment.speechActivity ?? []).entries()) {
      validateWindow(span.startSec, span.endSec, evidence.durationSec, `VAD span ${index + 1}`);
      if (
        span.startSec < segment.startSec - EPSILON
        || span.endSec > segment.endSec + EPSILON
        || span.startSec < previousVadEnd - EPSILON
      ) {
        fail("SPEECH_ACTIVITY_WINDOW", `Speech activity ${index + 1} falls outside Segment ${segment.sourceSegmentId}.`);
      }
      previousVadEnd = span.endSec;
    }
  }
  for (const id of expected) {
    if (!seen.has(id)) fail("SPEECH_SEGMENT_MISSING", `Aligned transcript is missing Segment ${id}.`);
  }
  const segmentsById = new Map(evidence.segments.map((segment) => [segment.sourceSegmentId, segment]));
  let previousSegmentStart = -Infinity;
  let previousSegmentEnd = -Infinity;
  for (const sourceSegment of narrative.segments) {
    const segment = segmentsById.get(sourceSegment.id)!;
    const basisSegment = basis.segments.find((item) => item.segmentId === sourceSegment.id)!;
    if (
      Math.abs(segment.startSec - basisSegment.startSec) > EPSILON
      || Math.abs(segment.endSec - basisSegment.endSec) > EPSILON
    ) {
      fail("SPEECH_EVIDENCE_SEGMENT_AFFINITY", `Segment ${segment.sourceSegmentId} differs from SpeechBasis.`);
    }
    if (
      segment.startSec < previousSegmentStart - EPSILON
      || segment.endSec < previousSegmentEnd - EPSILON
    ) {
      fail("SPEECH_SEGMENT_ORDER", `Segment ${segment.sourceSegmentId} violates Script source order.`);
    }
    previousSegmentStart = segment.startSec;
    previousSegmentEnd = segment.endSec;
  }
}

function syntheticCharTimes(
  characters: readonly string[],
  wordIndex: number,
  word: SpeechWordEvidence,
): TimedEvidenceChar[] {
  const hasWindow = finite(word.startSec) && finite(word.endSec);
  return characters.map((value, index) => ({
    value,
    wordIndex,
    ...(hasWindow
      ? {
          startSec: word.startSec! + (word.endSec! - word.startSec!) * index / characters.length,
          endSec: word.startSec! + (word.endSec! - word.startSec!) * (index + 1) / characters.length,
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
      ...(finite(char.startSec) && finite(char.endSec)
        ? { startSec: char.startSec, endSec: char.endSec }
        : {}),
    })));
  if (!supplied.length) return syntheticCharTimes(expected, wordIndex, word);

  const fallback = syntheticCharTimes(expected, wordIndex, word);
  const pairs = alignCharacters(expected, supplied.map((char) => char.value));
  for (const pair of pairs) {
    const suppliedChar = supplied[pair.evidenceIndex]!;
    if (!finite(suppliedChar.startSec) || !finite(suppliedChar.endSec)) continue;
    fallback[pair.sourceIndex] = {
      value: expected[pair.sourceIndex]!,
      wordIndex,
      startSec: suppliedChar.startSec,
      endSec: suppliedChar.endSec,
    };
  }
  return fallback;
}

function timedChars(segment: AlignedTranscriptSegment): TimedEvidenceChar[] {
  return segment.words.flatMap((word, index) => timedCharsForWord(word, index, segment.chars));
}

function scoredWords(segment: AlignedTranscriptSegment): SpeechWordEvidence[] {
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
): { readonly startSec: number; readonly endSec: number } | undefined {
  const wordRun = words.slice(group.evidenceWordStart, group.evidenceWordEndExclusive);
  const charRun = chars.filter((char) =>
    char.wordIndex >= group.evidenceWordStart && char.wordIndex < group.evidenceWordEndExclusive);
  const starts = [
    ...wordRun.map((word) => word.startSec),
    ...charRun.map((char) => char.startSec),
  ].filter(finite);
  const ends = [
    ...wordRun.map((word) => word.endSec),
    ...charRun.map((char) => char.endSec),
  ].filter(finite);
  if (!starts.length || !ends.length) return undefined;
  return { startSec: Math.min(...starts), endSec: Math.max(...ends) };
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
  const exactOneToOne = group.relation === "exact";
  const window = groupWindow(group, words, chars);

  for (let tokenOffset = 0; tokenOffset < sourceRun.length; tokenOffset += 1) {
    const evidenceForToken = pairs
      .filter((pair) => sourceCharacters[pair.sourceIndex]!.tokenOffset === tokenOffset)
      .map((pair) => evidenceCharacters[pair.evidenceIndex]!)
      .filter((char) => finite(char.startSec) && finite(char.endSec));
    let startSec = evidenceForToken[0]?.startSec;
    let endSec = evidenceForToken.at(-1)?.endSec;
    if (sourceRun.length === 1 && window) {
      startSec = window.startSec;
      endSec = window.endSec;
    } else if (window) {
      if (tokenOffset === 0 && finite(startSec)) startSec = window.startSec;
      if (tokenOffset === sourceRun.length - 1 && finite(endSec)) endSec = window.endSec;
    }
    if (!finite(startSec) || !finite(endSec)) continue;
    const sourceIndex = sourceIndexById.get(sourceRun[tokenOffset]!.id)!;
    output[sourceIndex] = {
      startSec,
      endSec: Math.max(startSec, endSec),
      startQuality: exactOneToOne ? "measured" : "derived",
      endQuality: exactOneToOne ? "measured" : "derived",
    };
  }
}

function speechBounds(segment: AlignedTranscriptSegment): { readonly start: number; readonly end: number } {
  const spans = segment.speechActivity ?? [];
  return spans.length
    ? { start: spans[0]!.startSec, end: spans.at(-1)!.endSec }
    : { start: segment.startSec, end: segment.endSec };
}

function fillEstimated(
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
    const left = runStart > 0 ? values[runStart - 1]!.endSec : startBound;
    const right = runEnd < values.length ? values[runEnd]!.startSec : endBound;
    const usableRight = Math.max(left, right);
    const weights = source
      .slice(runStart, runEnd)
      .map((token) => Math.max(1, [...token.normalized].length));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let consumed = 0;
    for (let index = runStart; index < runEnd; index += 1) {
      const weight = weights[index - runStart]!;
      const startSec = left + (usableRight - left) * consumed / totalWeight;
      consumed += weight;
      const endSec = left + (usableRight - left) * consumed / totalWeight;
      values[index] = {
        startSec,
        endSec,
        startQuality: "estimated",
        endQuality: "estimated",
      };
    }
  }
  return values as MutableTiming[];
}

function assertMonotonic(tokens: readonly TimedSpeechToken[], segmentId: string): void {
  let previousEnd = -Infinity;
  for (const token of tokens) {
    if (token.startSec < previousEnd - EPSILON || token.endSec < token.startSec - EPSILON) {
      fail("SPEECH_MAP_ORDER", `Located token ${token.tokenId} violates time order in Segment ${segmentId}.`);
    }
    previousEnd = token.endSec;
  }
}

function frameFor(basis: SpeechAudioBasis, timeSec: number): number {
  const { numerator, denominator } = basis.programSpace.frameRate;
  return Math.round(timeSec * numerator / denominator);
}

function secondsFor(basis: SpeechAudioBasis, frame: number): number {
  const { numerator, denominator } = basis.programSpace.frameRate;
  return frame * denominator / numerator;
}

export function locateSpeechTiming(
  narrative: Narrative,
  basis: SpeechAudioBasis,
  evidence: AlignedTranscriptEvidence,
): CompleteSemanticMap {
  validateBasis(narrative, basis);
  validateEvidence(narrative, basis, evidence);
  const evidenceBySegment = new Map(evidence.segments.map((segment) => [segment.sourceSegmentId, segment]));
  const timedSegments: TimedSpeechSegment[] = [];
  const timedTokens: TimedSpeechToken[] = [];
  const groups: AlignmentGroup[] = [];

  for (const segment of narrative.segments) {
    const aligned = evidenceBySegment.get(segment.id)!;
    const source = narrative.tokens.slice(segment.tokenStart, segment.tokenEndExclusive);
    const segmentGroups = alignWordGroups(segment.id, source, scoredWords(aligned));
    const chars = timedChars(aligned);
    const located: Array<MutableTiming | undefined> = Array(source.length).fill(undefined);
    for (const group of segmentGroups) locatePairedGroup(group, source, aligned.words, chars, located);
    const bounds = speechBounds(aligned);
    const complete = fillEstimated(located, source, bounds.start, bounds.end);
    const segmentTokens = source.map((token, index): TimedSpeechToken => {
      const timing = complete[index]!;
      const startFrame = frameFor(basis, timing.startSec);
      const endFrame = Math.max(startFrame, frameFor(basis, timing.endSec));
      return {
        tokenId: token.id,
        segmentId: segment.id,
        startSec: secondsFor(basis, startFrame),
        endSec: secondsFor(basis, endFrame),
        startFrame,
        endFrame,
        startQuality: timing.startQuality,
        endQuality: timing.endQuality,
      };
    });
    assertMonotonic(segmentTokens, segment.id);
    timedTokens.push(...segmentTokens);
    const startFrame = frameFor(basis, aligned.startSec);
    const endFrame = Math.max(startFrame, frameFor(basis, aligned.endSec));
    timedSegments.push({
      segmentId: segment.id,
      startSec: secondsFor(basis, startFrame),
      endSec: secondsFor(basis, endFrame),
      startFrame,
      endFrame,
      startQuality: "measured",
      endQuality: "measured",
    });
    groups.push(...segmentGroups);
  }

  const tokensById = new Map(timedTokens.map((token) => [token.tokenId, token]));
  const segmentsById = new Map(timedSegments.map((segment) => [segment.segmentId, segment]));
  const anchors: SemanticTimePoint[] = narrative.semanticIndex.anchors.map((anchor) => {
    if (anchor.kind === "segment-start" || anchor.kind === "segment-end") {
      const segment = segmentsById.get(anchor.segmentId)!;
      return anchor.kind === "segment-start"
        ? { identity: anchor.id, timeSec: segment.startSec, frame: segment.startFrame, quality: segment.startQuality }
        : { identity: anchor.id, timeSec: segment.endSec, frame: segment.endFrame, quality: segment.endQuality };
    }
    const token = tokensById.get(anchor.tokenId!)!;
    return anchor.kind === "token-start"
      ? { identity: anchor.id, timeSec: token.startSec, frame: token.startFrame, quality: token.startQuality }
      : { identity: anchor.id, timeSec: token.endSec, frame: token.endFrame, quality: token.endQuality };
  });
  const payload = {
    contract: "svml.complete-semantic-map@1" as const,
    quantizationPolicy: "nearest-frame" as const,
    durationSec: evidence.durationSec,
    segments: timedSegments,
    tokens: timedTokens,
    anchors,
    groups,
  };
  return payload;
}
