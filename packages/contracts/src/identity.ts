import { digestOf, isDigest } from "@svml/protocol";
import type { Digest } from "@svml/protocol";

import type {
  AlignedTranscriptEvidence,
  ProgramSpace,
  SpeechAudioBasis,
  SpeechBasis,
} from "./speech.js";

export function computeProgramSpaceDigest(value: Omit<ProgramSpace, "digest">): Digest {
  return digestOf(value);
}

export function computeSpeechBasisDigest(value: Omit<SpeechBasis, "basisDigest">): Digest {
  return digestOf(value);
}

export function computeAlignedTranscriptEvidenceDigest(
  value: Omit<AlignedTranscriptEvidence, "evidenceDigest">,
): Digest {
  return digestOf(value);
}

export function sealProgramSpace(value: Omit<ProgramSpace, "digest">): ProgramSpace {
  return { ...value, digest: computeProgramSpaceDigest(value) };
}

export function programSpaceFrameCount(programSpace: ProgramSpace): number {
  const frames = programSpace.durationSec
    * programSpace.frameRate.numerator
    / programSpace.frameRate.denominator;
  const rounded = Math.round(frames);
  if (!Number.isSafeInteger(rounded) || rounded < 1 || Math.abs(frames - rounded) > 1e-7) {
    throw new Error("ProgramSpace duration must end on an exact frame boundary.");
  }
  return rounded;
}

export function assertProgramSpaceIdentity(programSpace: ProgramSpace): void {
  if (programSpace.contract !== "svml.program-space@0") throw new Error("Unsupported ProgramSpace contract.");
  const { digest: _digest, ...content } = programSpace;
  if (!isDigest(programSpace.digest) || programSpace.digest !== computeProgramSpaceDigest(content)) {
    throw new Error("ProgramSpace digest does not match its canonical contents.");
  }
  const { numerator, denominator } = programSpace.frameRate;
  if (
    !Number.isSafeInteger(numerator)
    || numerator <= 0
    || !Number.isSafeInteger(denominator)
    || denominator <= 0
    || !Number.isFinite(programSpace.durationSec)
    || programSpace.durationSec <= 0
  ) {
    throw new Error("ProgramSpace is invalid.");
  }
  programSpaceFrameCount(programSpace);
}

export function sealSpeechBasis(value: Omit<SpeechBasis, "basisDigest">): SpeechBasis {
  return { ...value, basisDigest: computeSpeechBasisDigest(value) };
}

export function sealAlignedTranscriptEvidence(
  value: Omit<AlignedTranscriptEvidence, "evidenceDigest">,
): AlignedTranscriptEvidence {
  return { ...value, evidenceDigest: computeAlignedTranscriptEvidenceDigest(value) };
}

export function assertSpeechBasisIdentity(basis: SpeechBasis): void {
  if (basis.contract !== "svml.speech-basis@1") throw new Error("Unsupported SpeechBasis contract.");
  assertProgramSpaceIdentity(basis.programSpace);
  const { basisDigest: _basisDigest, ...basisContent } = basis;
  if (!isDigest(basis.basisDigest) || basis.basisDigest !== computeSpeechBasisDigest(basisContent)) {
    throw new Error("SpeechBasis digest does not match its canonical contents.");
  }
  if (
    !Number.isFinite(basis.programSpace.durationSec)
    || basis.programSpace.durationSec <= 0
    || basis.audio.durationSec !== basis.programSpace.durationSec
    || !isDigest(basis.audio.digest)
  ) {
    throw new Error("SpeechBasis audio does not match its ProgramSpace.");
  }
}

/**
 * Validate the self-contained identity claims of an audio projection.
 *
 * `basisDigest` names the complete SpeechBasis Product, so it intentionally
 * cannot be recomputed from this projection after the visual fields have been
 * removed. The graph-level affinity constraints prove that relationship.
 */
export function assertSpeechAudioBasisIdentity(basis: SpeechAudioBasis): void {
  if (basis.contract !== "svml.speech-audio-basis@1") {
    throw new Error("Unsupported SpeechAudioBasis contract.");
  }
  if (!isDigest(basis.basisDigest) || !isDigest(basis.narrativeDigest)) {
    throw new Error("SpeechAudioBasis identity digest is invalid.");
  }
  assertProgramSpaceIdentity(basis.programSpace);
  if (
    !Number.isFinite(basis.programSpace.durationSec)
    || basis.programSpace.durationSec <= 0
    || basis.audio.durationSec !== basis.programSpace.durationSec
    || !isDigest(basis.audio.digest)
  ) {
    throw new Error("SpeechAudioBasis audio does not match its ProgramSpace.");
  }
  if (basis.segments.length === 0) {
    throw new Error("SpeechAudioBasis must contain at least one Segment.");
  }
  let previousEnd = 0;
  for (const segment of basis.segments) {
    if (
      segment.segmentId.length === 0
      || !Number.isFinite(segment.startSec)
      || !Number.isFinite(segment.endSec)
      || segment.startSec < previousEnd
      || segment.endSec < segment.startSec
      || segment.endSec > basis.programSpace.durationSec
      || !isDigest(segment.sourceArtifactDigest)
    ) {
      throw new Error("SpeechAudioBasis Segment is invalid or out of order.");
    }
    previousEnd = segment.endSec;
  }
}
