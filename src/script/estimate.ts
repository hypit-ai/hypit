import type {
  AlignmentCaptionCue,
  AlignmentEvidence,
  NarrativeIR,
  ScriptToken,
} from "../model.js";

export type EstimateOptions = {
  syllablesPerSecond?: number;
  wordGapSec?: number;
  segmentPaddingSec?: number;
  emptySegmentSec?: number;
  maxCaptionWords?: number;
  fps?: number;
};

function syllables(token: ScriptToken): number {
  if (/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]\p{M}*$/u.test(token.text)) {
    return 1;
  }
  const ascii = token.normalized
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en");
  const groups = ascii.match(/[aeiouy]+/gu)?.length ?? 0;
  const silentE = groups > 1 && /[^aeiou]e$/u.test(ascii) ? 1 : 0;
  return Math.max(1, groups - silentE);
}

function captionCues(narrative: NarrativeIR, maxWords: number): AlignmentCaptionCue[] {
  const output: AlignmentCaptionCue[] = [];
  for (const segment of narrative.segments) {
    for (
      let startWord = segment.tokenStart;
      startWord < segment.tokenEnd;
      startWord += maxWords
    ) {
      output.push({
        id: `estimate-cue-${output.length + 1}`,
        startWord,
        endWordExclusive: Math.min(segment.tokenEnd, startWord + maxWords),
      });
    }
  }
  return output;
}

export function estimateAlignment(
  narrative: NarrativeIR,
  options: EstimateOptions = {},
): AlignmentEvidence {
  const syllablesPerSecond = options.syllablesPerSecond ?? 6.5;
  const wordGapSec = options.wordGapSec ?? 0.045;
  const segmentPaddingSec = options.segmentPaddingSec ?? 0.12;
  const emptySegmentSec = options.emptySegmentSec ?? 1;
  const maxCaptionWords = Math.max(1, Math.floor(options.maxCaptionWords ?? 3));
  const fps = Math.max(1, Math.round(options.fps ?? 30));
  for (const [name, value] of Object.entries({
    syllablesPerSecond,
    wordGapSec,
    segmentPaddingSec,
    emptySegmentSec,
  })) {
    if (!Number.isFinite(value) || value < 0 || (name === "syllablesPerSecond" && value === 0)) {
      throw new Error(`invalid estimate option ${name}=${String(value)}`);
    }
  }

  let cursor = 0;
  const words: AlignmentEvidence["words"] = [];
  const segments: AlignmentEvidence["segments"] = [];
  for (const segment of narrative.segments) {
    const segmentTokens = narrative.tokens.slice(segment.tokenStart, segment.tokenEnd);
    const startSec = cursor;
    if (!segmentTokens.length) {
      cursor += emptySegmentSec;
      cursor = Math.ceil(cursor * fps) / fps;
      segments.push({ id: segment.id, startSec, endSec: cursor });
      continue;
    }
    cursor += segmentPaddingSec;
    for (const [index, token] of segmentTokens.entries()) {
      const wordStart = cursor;
      cursor += syllables(token) / syllablesPerSecond;
      words.push({
        text: token.text,
        startSec: wordStart,
        endSec: cursor,
        segmentId: segment.id,
      });
      if (index < segmentTokens.length - 1) cursor += wordGapSec;
    }
    cursor += segmentPaddingSec;
    cursor = Math.ceil(cursor * fps) / fps;
    segments.push({ id: segment.id, startSec, endSec: cursor });
  }
  const durationFrames = Math.max(1, Math.ceil(cursor * fps));
  const durationSec = durationFrames / fps;
  return {
    contract: "svml.speech-alignment.v1",
    durationSec,
    fps,
    words,
    segments,
    captionCues: captionCues(narrative, maxCaptionWords),
    provenance: {
      method: "svml.syllable-estimate.v1",
      measured: false,
      syllablesPerSecond,
      wordGapSec,
      segmentPaddingSec,
      emptySegmentSec,
      maxCaptionWords,
    },
  };
}
