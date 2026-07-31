import { fail } from "../diagnostics.js";
import type {
  AlignmentEvidence,
  LocatedScript,
  MarkerBoundary,
  NarrativeIR,
  ProgramRange,
} from "../model.js";
import { normalizeWord } from "../util.js";

function frameAt(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

function range(startSec: number, endSec: number, fps: number): ProgramRange {
  const startFrame = frameAt(startSec, fps);
  const endFrameExclusive = frameAt(endSec, fps);
  if (endFrameExclusive < startFrame) {
    fail("locate_negative_range", `Range ${startSec}..${endSec} resolves backwards.`);
  }
  return {
    startFrame,
    endFrameExclusive,
    startSec: startFrame / fps,
    endSec: endFrameExclusive / fps,
  };
}

function boundaryTime(
  boundary: MarkerBoundary,
  affinity: "left" | "right",
  narrative: NarrativeIR,
  evidence: AlignmentEvidence,
): number {
  const left = boundary.tokenIndex > 0 ? evidence.words[boundary.tokenIndex - 1] : undefined;
  const right = evidence.words[boundary.tokenIndex];
  if (affinity === "left" && left) return left.endSec;
  if (affinity === "right" && right) return right.startSec;

  const segment = boundary.segmentId
    ? evidence.segments.find((item) => item.id === boundary.segmentId)
    : undefined;
  if (segment) return affinity === "left" ? segment.endSec : segment.startSec;

  const cut = boundary.structuralCut ?? 0;
  if (cut <= 0) return 0;
  if (cut >= narrative.segments.length) return evidence.durationSec;
  const rightSegment = evidence.segments.find((item) => item.id === narrative.segments[cut]?.id);
  const leftSegment = evidence.segments.find((item) => item.id === narrative.segments[cut - 1]?.id);
  if (affinity === "right" && rightSegment) return rightSegment.startSec;
  if (leftSegment) return leftSegment.endSec;
  fail("locate_unresolved_boundary", `Could not resolve structural cut ${cut}.`);
}

export function locateScript(
  narrative: NarrativeIR,
  evidence: AlignmentEvidence,
): LocatedScript {
  if (evidence.contract !== "svml.speech-alignment.v1") {
    fail("locate_alignment_contract", `Unsupported alignment contract "${evidence.contract}".`);
  }
  if (
    !Number.isFinite(evidence.fps)
    || evidence.fps <= 0
    || !Number.isFinite(evidence.durationSec)
    || evidence.durationSec <= 0
  ) {
    fail("locate_alignment_clock", "Alignment evidence requires positive finite fps and durationSec.");
  }
  if (narrative.tokens.length !== evidence.words.length) {
    fail(
      "locate_alignment_cardinality",
      `Script has ${narrative.tokens.length} words but alignment has ${evidence.words.length}.`,
    );
  }
  for (let index = 0; index < evidence.words.length; index += 1) {
    const word = evidence.words[index];
    if (!word) continue;
    if (
      !Number.isFinite(word.startSec)
      || !Number.isFinite(word.endSec)
      || word.startSec < 0
      || word.endSec < word.startSec
      || word.endSec > evidence.durationSec
    ) {
      fail(
        "locate_alignment_word_window",
        `Alignment word ${index + 1} has invalid window ${word.startSec}..${word.endSec}.`,
      );
    }
    const previous = evidence.words[index - 1];
    if (previous && word.startSec < previous.endSec - 1e-6) {
      fail(
        "locate_alignment_word_overlap",
        `Alignment word ${index + 1} starts at ${word.startSec} before word ${index} ends at ${previous.endSec}.`,
      );
    }
    const segment = evidence.segments.find((item) => item.id === word.segmentId);
    if (
      !segment
      || word.startSec < segment.startSec - 1e-6
      || word.endSec > segment.endSec + 1e-6
    ) {
      fail(
        "locate_alignment_word_segment",
        `Alignment word ${index + 1} falls outside segment "${word.segmentId}".`,
      );
    }
  }
  for (let index = 0; index < narrative.tokens.length; index += 1) {
    const token = narrative.tokens[index];
    const word = evidence.words[index];
    if (!token || !word) continue;
    if (token.normalized !== normalizeWord(word.text)) {
      fail(
        "locate_alignment_word_mismatch",
        `Word ${index + 1} is "${token.text}" in Script and "${word.text}" in alignment evidence.`,
      );
    }
    if (token.segmentId !== word.segmentId) {
      fail(
        "locate_alignment_segment_mismatch",
        `Word ${index + 1} belongs to ${token.segmentId} in Script and ${word.segmentId} in evidence.`,
      );
    }
  }
  const fps = evidence.fps;
  const words = narrative.tokens.map((token, index) => {
    const word = evidence.words[index];
    if (!word) fail("locate_alignment_missing_word", `Missing aligned word ${index + 1}.`);
    return { ...token, ...range(word.startSec, word.endSec, fps) };
  });
  const segments = Object.fromEntries(evidence.segments.map((segment) => [
    segment.id,
    range(segment.startSec, segment.endSec, fps),
  ]));
  const selections = Object.fromEntries(Object.entries(narrative.selections).map(([id, occurrences]) => [
    id,
    {
      id,
      ranges: occurrences.map((occurrence) => range(
        boundaryTime(occurrence.open.boundary, occurrence.open.affinity, narrative, evidence),
        boundaryTime(occurrence.close.boundary, occurrence.close.affinity, narrative, evidence),
        fps,
      )),
    },
  ]));
  const moments = Object.fromEntries(Object.entries(narrative.moments).map(([id, occurrences]) => [
    id,
    {
      id,
      frames: occurrences.map((occurrence) => frameAt(
        boundaryTime(occurrence.boundary, occurrence.affinity, narrative, evidence),
        fps,
      )),
    },
  ]));
  const captionAtoms = narrative.captionAtoms.map((atom) => {
    const first = words[atom.startWord];
    const last = words[atom.endWordExclusive - 1];
    if (!first || !last || first.segmentId !== last.segmentId) {
      fail("locate_caption_atom", `Caption atom "${atom.id}" has an invalid speech span.`);
    }
    return {
      ...atom,
      ...range(first.startSec, last.endSec, fps),
    };
  });
  const captionCues = evidence.captionCues?.map((cue, index) => {
    if (!Number.isInteger(cue.startWord) || !Number.isInteger(cue.endWordExclusive)) {
      fail("locate_caption_cue_index", `Caption cue ${index + 1} must use integer word indexes.`);
    }
    if (
      cue.startWord < 0
      || cue.endWordExclusive <= cue.startWord
      || cue.endWordExclusive > words.length
    ) {
      fail(
        "locate_caption_cue_range",
        `Caption cue ${index + 1} has invalid word range ${cue.startWord}..${cue.endWordExclusive}.`,
      );
    }
    const previous = evidence.captionCues?.[index - 1];
    const expectedStart = previous?.endWordExclusive ?? 0;
    if (cue.startWord !== expectedStart) {
      fail(
        "locate_caption_cue_partition",
        `Caption cue ${index + 1} starts at word ${cue.startWord}; expected ${expectedStart}.`,
      );
    }
    const first = words[cue.startWord];
    const last = words[cue.endWordExclusive - 1];
    if (!first || !last) {
      fail("locate_caption_cue_word", `Caption cue ${index + 1} references a missing word.`);
    }
    if (first.segmentId !== last.segmentId) {
      fail(
        "locate_caption_cue_segment",
        `Caption cue ${index + 1} crosses Script segments ${first.segmentId} and ${last.segmentId}.`,
      );
    }
    for (const atom of captionAtoms) {
      const overlaps = cue.startWord < atom.endWordExclusive
        && cue.endWordExclusive > atom.startWord;
      const contains = cue.startWord <= atom.startWord
        && cue.endWordExclusive >= atom.endWordExclusive;
      if (overlaps && !contains) {
        fail(
          "locate_caption_partial_dual",
          `Caption cue ${index + 1} cuts through Dual Text atom "${atom.id}".`,
        );
      }
    }
    return {
      id: cue.id ?? `cue-${index + 1}`,
      startWord: cue.startWord,
      endWordExclusive: cue.endWordExclusive,
      ...range(first.startSec, last.endSec, fps),
    };
  });
  if (
    captionCues
    && (captionCues.at(-1)?.endWordExclusive ?? 0) !== words.length
  ) {
    fail(
      "locate_caption_cue_partition",
      `Caption cues end at word ${captionCues.at(-1)?.endWordExclusive ?? 0}; expected ${words.length}.`,
    );
  }
  return {
    durationFrames: frameAt(evidence.durationSec, fps),
    durationSec: frameAt(evidence.durationSec, fps) / fps,
    fps,
    words,
    segments,
    selections,
    moments,
    captionAtoms,
    ...(captionCues ? { captionCues } : {}),
  };
}
