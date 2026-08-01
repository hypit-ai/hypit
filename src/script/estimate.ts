import type {
  NarrativeIR,
  ScriptToken,
  SpeechTimingEvidence,
} from "../model.js";

export type EstimateOptions = {
  syllablesPerSecond?: number;
  wordGapSec?: number;
  segmentPaddingSec?: number;
  emptySegmentSec?: number;
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

export function estimateSpeechTiming(
  narrative: NarrativeIR,
  options: EstimateOptions = {},
): SpeechTimingEvidence {
  const syllablesPerSecond = options.syllablesPerSecond ?? 6.5;
  const wordGapSec = options.wordGapSec ?? 0.045;
  const segmentPaddingSec = options.segmentPaddingSec ?? 0.12;
  const emptySegmentSec = options.emptySegmentSec ?? 1;
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
  const units: SpeechTimingEvidence["units"] = [];
  const segments: SpeechTimingEvidence["segments"] = [];
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
      units.push({
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
    contract: "svml.speech-timing-evidence.v1",
    durationSec,
    fps,
    quality: "estimated",
    units,
    segments,
    provenance: {
      method: "svml.syllable-estimate.v1",
      measured: false,
      syllablesPerSecond,
      wordGapSec,
      segmentPaddingSec,
      emptySegmentSec,
    },
  };
}
