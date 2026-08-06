import { digestOf, isDigest } from "@svml/protocol";
import type { Digest } from "@svml/protocol";

import type {
  AlignedTranscriptEvidence,
  ProgramSpace,
  SpeechAudioBasis,
  SpeechBasis,
  SpeechEvidenceAudio,
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

export function computeSpeechEvidenceAudioDigest(
  value: Omit<SpeechEvidenceAudio, "evidenceAudioDigest">,
): Digest {
  return digestOf(value);
}

/** Round one 48 kHz master-sample boundary onto the canonical 16 kHz evidence clock. */
export function speechEvidenceSampleBoundary(masterSampleBoundary: number): number {
  if (!Number.isSafeInteger(masterSampleBoundary) || masterSampleBoundary < 0) {
    throw new Error("Speech evidence source sample boundary is invalid.");
  }
  const value = (BigInt(masterSampleBoundary) * 16_000n * 2n + 48_000n) / (48_000n * 2n);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Speech evidence sample boundary exceeds safe arithmetic.");
  }
  return Number(value);
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

/** Nearest sample boundary at the exact terminal frame of one ProgramSpace. */
export function programSpaceSampleFrames(programSpace: ProgramSpace, sampleRate: number): number {
  const frames = programSpaceFrameCount(programSpace);
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
    throw new Error("ProgramSpace sample rate is invalid.");
  }
  const numerator = BigInt(frames) * BigInt(sampleRate) * BigInt(programSpace.frameRate.denominator);
  const denominator = BigInt(programSpace.frameRate.numerator);
  const value = (numerator * 2n + denominator) / (denominator * 2n);
  if (value < 1n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("ProgramSpace sample domain exceeds safe arithmetic.");
  }
  return Number(value);
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

export function sealSpeechEvidenceAudio(
  value: Omit<SpeechEvidenceAudio, "evidenceAudioDigest">,
): SpeechEvidenceAudio {
  return { ...value, evidenceAudioDigest: computeSpeechEvidenceAudioDigest(value) };
}

export function assertSpeechEvidenceAudioIdentity(value: SpeechEvidenceAudio): void {
  if (value.contract !== "svml.speech-evidence-audio@1") {
    throw new Error("Unsupported SpeechEvidenceAudio contract.");
  }
  if (
    !isDigest(value.basisDigest)
    || !isDigest(value.narrativeDigest)
    || !isDigest(value.programSpaceDigest)
    || !isDigest(value.sourceAudioArtifactDigest)
    || value.artifact.kind !== "blob"
    || !isDigest(value.artifact.digest)
    || !Number.isSafeInteger(value.artifact.size)
    || value.artifact.size < 0
    || value.artifact.mediaType !== "audio/wav"
    || value.codec !== "pcm_s16le"
    || value.sampleRate !== 16_000
    || value.channels !== 1
    || !Number.isSafeInteger(value.sampleFrames)
    || value.sampleFrames < 1
    || !Number.isFinite(value.durationSec)
    || value.durationSec <= 0
  ) {
    throw new Error("SpeechEvidenceAudio media identity is invalid.");
  }
  if (
    value.sampleMap.algorithm !== "rational-boundary-round@1"
    || value.sampleMap.sourceSampleRate !== 48_000
    || value.sampleMap.evidenceSampleRate !== 16_000
    || !Number.isSafeInteger(value.sampleMap.sourceSampleFrames)
    || value.sampleMap.sourceSampleFrames < 1
    || value.sampleMap.evidenceSampleFrames !== value.sampleFrames
    || value.sampleMap.sourceOriginSample !== 0
    || value.sampleMap.evidenceOriginSample !== 0
    || value.sampleMap.resamplerImplementation.length === 0
    || speechEvidenceSampleBoundary(value.sampleMap.sourceSampleFrames) !== value.sampleFrames
  ) {
    throw new Error("SpeechEvidenceAudio sample map is invalid.");
  }
  if (value.segments.length === 0) throw new Error("SpeechEvidenceAudio has no Segment identity.");
  const { evidenceAudioDigest: _digest, ...content } = value;
  if (!isDigest(value.evidenceAudioDigest)
    || value.evidenceAudioDigest !== computeSpeechEvidenceAudioDigest(content)) {
    throw new Error("SpeechEvidenceAudio digest does not match its canonical contents.");
  }
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
