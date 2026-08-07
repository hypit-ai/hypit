import { isDigest } from "@svml/protocol";

import type {
  AlignedTranscriptEvidence,
  ProgramSpace,
  SpeechAudioBasis,
  SpeechBasis,
  SpeechDuration,
  SpeechEvidenceAudio,
} from "./speech.js";

export function sealSpeechDuration(value: SpeechDuration): SpeechDuration {
  return structuredClone(value);
}

export function assertSpeechDurationIdentity(value: SpeechDuration): void {
  if (value.contract !== "svml.speech-duration@1") throw new Error("Unsupported SpeechDuration contract.");
  if (
    !Number.isFinite(value.durationSec)
    || value.durationSec <= 0
  ) {
    throw new Error("SpeechDuration is invalid.");
  }
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

export function sealProgramSpace(value: ProgramSpace): ProgramSpace {
  return structuredClone(value);
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

export function sealSpeechBasis(value: SpeechBasis): SpeechBasis {
  return structuredClone(value);
}

export function sealAlignedTranscriptEvidence(
  value: AlignedTranscriptEvidence,
): AlignedTranscriptEvidence {
  return structuredClone(value);
}

export function sealSpeechEvidenceAudio(
  value: SpeechEvidenceAudio,
): SpeechEvidenceAudio {
  return structuredClone(value);
}

export function assertSpeechEvidenceAudioIdentity(value: SpeechEvidenceAudio): void {
  if (value.contract !== "svml.speech-evidence-audio@1") {
    throw new Error("Unsupported SpeechEvidenceAudio contract.");
  }
  if (
    value.artifact.kind !== "blob"
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
    || speechEvidenceSampleBoundary(value.sampleMap.sourceSampleFrames) !== value.sampleFrames
  ) {
    throw new Error("SpeechEvidenceAudio sample map is invalid.");
  }
  if (value.segments.length === 0) throw new Error("SpeechEvidenceAudio has no Segment identity.");
}

export function assertSpeechBasisIdentity(basis: SpeechBasis): void {
  if (basis.contract !== "svml.speech-basis@1") throw new Error("Unsupported SpeechBasis contract.");
  assertProgramSpaceIdentity(basis.programSpace);
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
 * Validate the intrinsic content of an audio projection. Its relationship to
 * a SpeechBasis is an explicit graph edge recorded by Core.
 */
export function assertSpeechAudioBasisIdentity(basis: SpeechAudioBasis): void {
  if (basis.contract !== "svml.speech-audio-basis@1") {
    throw new Error("Unsupported SpeechAudioBasis contract.");
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
    ) {
      throw new Error("SpeechAudioBasis Segment is invalid or out of order.");
    }
    previousEnd = segment.endSec;
  }
}
