import { digestOf, isDigest } from "@narratage/protocol";
import type { Narrative, NarrativeToken } from "@narratage/narrative";
import type { ProgramSpace } from "@narratage/program-space";
import type { SpeechAudioBasis, SpeechBasis } from "@narratage/speech";
import type { AlignedTranscriptEvidence, AlignedTranscriptSegment, SpeechCharacterEvidence, SpeechWordEvidence } from "@narratage/speech-evidence";
import type { CompleteSemanticMap, SemanticTimePoint, TimedSpeechToken } from "@narratage/semantic-map";

import { alignWordGroups } from "./align.js";
import { SpeechAlignmentError } from "./error.js";
import { alignCharacters, alignmentCharacters } from "./normalize.js";
import type { AlignmentGroup, TimedSpeechSegment } from "./types.js";

export const speechLocatorDigest = digestOf("@narratage/speech-alignment/locate@1");

type MutableTiming = {
  startSec: number;
  endSec: number;
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

/**
 * A time is rejected only when no frame can be derived from it. Whether a window
 * runs backwards, leaves its Segment or reaches past the programme is a fact
 * about the recording, reported as measured.
 */
function validateWindow(start: number, end: number, _limit: number, label: string): void {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0) {
    fail("SPEECH_WINDOW", `${label} has an unusable time ${start}..${end}.`);
  }
}

function validateBasis(narrative: Narrative, basis: SpeechAudioBasis): void {
  const { numerator, denominator } = basis.programSpace.frameRate;
  if (!Number.isSafeInteger(numerator) || numerator <= 0 || !Number.isSafeInteger(denominator) || denominator <= 0) {
    fail("SPEECH_FRAME_RATE", "ProgramSpace frame rate must be a positive rational number.");
  }
  if (
    !Number.isFinite(basis.programSpace.durationSec)
    || basis.programSpace.durationSec <= 0
  ) {
    fail("SPEECH_BASIS_DURATION", "SpeechAudioBasis ProgramSpace must have a positive duration.");
  }
  if (basis.audio.kind !== "blob" || !isDigest(basis.audio.digest)
    || basis.audio.mediaType !== "audio/wav" || !Number.isSafeInteger(basis.audio.size) || basis.audio.size < 0) {
    fail("SPEECH_AUDIO_DIGEST", "SpeechBasis audio BlobRef is invalid.");
  }
  if (basis.segments.length !== narrative.segments.length) {
    fail("SPEECH_BASIS_SEGMENTS", "SpeechAudioBasis must cover every Narrative Segment exactly once.");
  }
  for (const [index, segment] of basis.segments.entries()) {
    const expected = narrative.segments[index]!;
    if (segment.segmentId !== expected.id) {
      fail("SPEECH_BASIS_SEGMENTS", `SpeechAudioBasis Segment ${segment.segmentId} does not match ${expected.id}.`);
    }
    validateWindow(segment.startSec, segment.endSec, basis.programSpace.durationSec, `Basis Segment ${segment.segmentId}`);
  }
}

function validateEvidence(
  narrative: Narrative,
  basis: SpeechAudioBasis,
  evidence: AlignedTranscriptEvidence,
): void {
  const durationSec = basis.programSpace.durationSec;
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
    for (const [index, word] of segment.words.entries()) {
      if (typeof word.text !== "string") fail("SPEECH_WORD_TEXT", `Word ${index + 1} has no text.`);
      if (finite(word.startSec) && finite(word.endSec)) {
        validateWindow(word.startSec, word.endSec, durationSec, `Word ${index + 1}`);
      }
    }
    for (const [index, char] of segment.chars.entries()) {
      if (!Number.isInteger(char.wordIndex) || char.wordIndex < 0 || char.wordIndex >= segment.words.length) {
        fail("SPEECH_CHAR_WORD", `Character ${index + 1} has an invalid wordIndex.`);
      }
      if (finite(char.startSec) && finite(char.endSec)) {
        validateWindow(char.startSec, char.endSec, durationSec, `Character ${index + 1}`);
      }
    }
    for (const [index, span] of (segment.speechActivity ?? []).entries()) {
      validateWindow(span.startSec, span.endSec, durationSec, `VAD span ${index + 1}`);
    }
  }
  for (const id of expected) {
    if (!seen.has(id)) fail("SPEECH_SEGMENT_MISSING", `Aligned transcript is missing Segment ${id}.`);
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
  // The envelope of a run of evidence, not a correction of any one measurement.
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
    output[sourceIndex] = { startSec, endSec };
  }
}

function speechBounds(
  segment: AlignedTranscriptSegment,
  basisSegment: { readonly startSec: number; readonly endSec: number },
): { readonly start: number; readonly end: number } {
  const spans = segment.speechActivity ?? [];
  return spans.length
    ? { start: spans[0]!.startSec, end: spans.at(-1)!.endSec }
    : { start: basisSegment.startSec, end: basisSegment.endSec };
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
    const left = runStart > 0 ? values[runStart - 1]!.endSec : startBound;
    const right = runEnd < values.length ? values[runEnd]!.startSec : endBound;
    // These tokens have no measurement at all, so this bound shapes an invention
    // rather than editing anything that was measured.
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
      };
    }
  }
  return values as MutableTiming[];
}

function frameFor(basis: SpeechAudioBasis, timeSec: number): number {
  const { numerator, denominator } = basis.programSpace.frameRate;
  return Math.round(timeSec * numerator / denominator);
}

/**
 * Locate every Script token against one recording.
 *
 * The result is total: every token of every Segment carries a window, whether it
 * was measured, derived from a neighbouring character run, or interpolated
 * because the transcript never reached it. Whether a window runs backwards,
 * overlaps its neighbour or leaves its Segment is reported as measured — those
 * are facts about the recording, and deciding what they mean belongs to whoever
 * projects them onto a timeline.
 *
 * Locating fails only when the Script, the audio and the transcript are not the
 * same three things: a missing or repeated Segment, a Segment the Script never
 * declared, or a transcript answering a different segmentation. It never fails
 * merely because a provider timestamp is awkward.
 */
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

  for (const segment of narrative.segments) {
    const aligned = evidenceBySegment.get(segment.id)!;
    const source = narrative.tokens.slice(segment.tokenStart, segment.tokenEndExclusive);
    const segmentGroups = alignWordGroups(segment.id, source, scoredWords(aligned));
    const chars = timedChars(aligned);
    const located: Array<MutableTiming | undefined> = Array(source.length).fill(undefined);
    for (const group of segmentGroups) locatePairedGroup(group, source, aligned.words, chars, located);
    const basisSegment = basis.segments.find((item) => item.segmentId === segment.id)!;
    const bounds = speechBounds(aligned, basisSegment);
    const complete = fillMissingTiming(located, source, bounds.start, bounds.end);
    const segmentTokens = source.map((token, index): TimedSpeechToken => {
      const timing = complete[index]!;
      const startFrame = frameFor(basis, timing.startSec);
      const endFrame = frameFor(basis, timing.endSec);
      return {
        tokenId: token.id,
        segmentId: segment.id,
        startFrame,
        endFrameExclusive: endFrame,
      };
    });
    timedTokens.push(...segmentTokens);
    const startFrame = frameFor(basis, basisSegment.startSec);
    const endFrame = frameFor(basis, basisSegment.endSec);
    timedSegments.push({
      segmentId: segment.id,
      startFrame,
      endFrameExclusive: endFrame,
    });
  }

  const tokensById = new Map(timedTokens.map((token) => [token.tokenId, token]));
  const segmentsById = new Map(timedSegments.map((segment) => [segment.segmentId, segment]));
  const anchors: SemanticTimePoint[] = narrative.semanticIndex.anchors.map((anchor) => {
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
  return {
    tokens: timedTokens,
    anchors,
  };
}
