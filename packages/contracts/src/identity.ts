import { digestOf, isDigest } from "@svml/core";
import type { Digest } from "@svml/protocol";

import type { AlignedTranscriptEvidence, ProgramSpace, SpeechBasis } from "./speech.js";

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
  const { digest: _programDigest, ...programContent } = basis.programSpace;
  if (
    !isDigest(basis.programSpace.digest)
    || basis.programSpace.digest !== computeProgramSpaceDigest(programContent)
  ) {
    throw new Error("ProgramSpace digest does not match its canonical contents.");
  }
  const { basisDigest: _basisDigest, ...basisContent } = basis;
  if (!isDigest(basis.basisDigest) || basis.basisDigest !== computeSpeechBasisDigest(basisContent)) {
    throw new Error("SpeechBasis digest does not match its canonical contents.");
  }
  const { numerator, denominator } = basis.programSpace.frameRate;
  if (
    !Number.isSafeInteger(numerator)
    || numerator <= 0
    || !Number.isSafeInteger(denominator)
    || denominator <= 0
  ) {
    throw new Error("ProgramSpace frame rate must be a positive rational number.");
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
