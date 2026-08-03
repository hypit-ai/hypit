import type { ParsedNarrative } from "@svml/script";

import { WhisperXAlignmentError } from "./error.js";
import type { CompleteSpeechTimeMap, TimedCaptionAtom, TimingQuality } from "./types.js";

const QUALITY_RANK: Readonly<Record<TimingQuality, number>> = {
  measured: 0,
  derived: 1,
  estimated: 2,
};

function worse(left: TimingQuality, right: TimingQuality): TimingQuality {
  return QUALITY_RANK[left] >= QUALITY_RANK[right] ? left : right;
}

/**
 * Derives only explicit Dual Text atoms. Ordinary caption text reuses its
 * corresponding speech token timing directly. A Dual Text display side stays
 * atomic and inherits the complete speech-side envelope; it is never linearly
 * split into invented display-word times.
 */
export function deriveCaptionAtomTiming(
  narrative: ParsedNarrative,
  map: CompleteSpeechTimeMap,
): TimedCaptionAtom[] {
  if (map.semanticIndexDigest !== narrative.semanticIndex.digest) {
    throw new WhisperXAlignmentError(
      "WHISPERX_CAPTION_MAP",
      "Caption projection and speech map use different Semantic Indexes.",
    );
  }
  return narrative.captionAtoms.map((atom) => {
    const source = narrative.tokens.slice(atom.startToken, atom.endTokenExclusive);
    const timed = source.map((token) => map.tokens.find((value) => value.tokenId === token.id));
    if (!timed.length || timed.some((token) => token === undefined)) {
      throw new WhisperXAlignmentError(
        "WHISPERX_CAPTION_COVERAGE",
        `Caption atom ${atom.id} is not covered by the complete speech map.`,
      );
    }
    const first = timed[0]!;
    const last = timed.at(-1)!;
    return {
      id: atom.id,
      display: atom.display,
      segmentId: atom.segmentId,
      sourceTokenIds: source.map((token) => token.id),
      startSec: first.startSec,
      endSec: last.endSec,
      startQuality: worse(first.startQuality, "derived"),
      endQuality: worse(last.endQuality, "derived"),
    };
  });
}
