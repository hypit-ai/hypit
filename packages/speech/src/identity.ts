import { isDigest } from "@narratage/protocol";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@narratage/program-space";
import { assertIntrinsicExtent } from "@narratage/spatial";
import type { SpeechAudioBasis, SpeechBasis, SpeechDuration, SpeechEvidenceAudio } from "./types.js";
function assertAudioBlob(value: SpeechBasis["audio"], label: string): void {
  if (value.kind !== "blob" || !isDigest(value.digest) || !Number.isSafeInteger(value.size)
    || value.size < 0 || value.mediaType !== "audio/wav") throw new Error(`${label} must be a canonical WAV BlobRef.`);
}
export function sealSpeechDuration(value: SpeechDuration): SpeechDuration { return structuredClone(value); }
export function assertSpeechDurationIdentity(value: SpeechDuration): void {
  if (value.contract !== "svml.speech-duration@1" || !Number.isFinite(value.durationSec) || value.durationSec <= 0) throw new Error("SpeechDuration is invalid.");
}
export function speechEvidenceSampleBoundary(masterSampleBoundary: number): number {
  if (!Number.isSafeInteger(masterSampleBoundary) || masterSampleBoundary < 0) throw new Error("Speech evidence source sample boundary is invalid.");
  const value = (BigInt(masterSampleBoundary) * 16_000n * 2n + 48_000n) / (48_000n * 2n);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Speech evidence sample boundary exceeds safe arithmetic.");
  return Number(value);
}
export function sealSpeechBasis(value: SpeechBasis): SpeechBasis { return structuredClone(value); }
export function sealSpeechEvidenceAudio(value: SpeechEvidenceAudio): SpeechEvidenceAudio { return structuredClone(value); }
export function assertSpeechEvidenceAudioIdentity(value: SpeechEvidenceAudio): void {
  if (value.contract !== "svml.speech-evidence-audio@1" || value.artifact.kind !== "blob" || !isDigest(value.artifact.digest)
    || !Number.isSafeInteger(value.artifact.size) || value.artifact.size < 0 || value.artifact.mediaType !== "audio/wav"
    || value.codec !== "pcm_s16le" || value.sampleRate !== 16_000 || value.channels !== 1 || !Number.isSafeInteger(value.sampleFrames)
    || value.sampleFrames < 1 || !Number.isFinite(value.durationSec) || value.durationSec <= 0) throw new Error("SpeechEvidenceAudio media identity is invalid.");
  if (value.sampleMap.algorithm !== "rational-boundary-round@1" || value.sampleMap.sourceSampleRate !== 48_000
    || value.sampleMap.evidenceSampleRate !== 16_000 || !Number.isSafeInteger(value.sampleMap.sourceSampleFrames)
    || value.sampleMap.sourceSampleFrames < 1 || value.sampleMap.evidenceSampleFrames !== value.sampleFrames
    || value.sampleMap.sourceOriginSample !== 0 || value.sampleMap.evidenceOriginSample !== 0
    || speechEvidenceSampleBoundary(value.sampleMap.sourceSampleFrames) !== value.sampleFrames) throw new Error("SpeechEvidenceAudio sample map is invalid.");
  if (value.segments.length === 0) throw new Error("SpeechEvidenceAudio has no Segment identity.");
}
export function assertSpeechBasisIdentity(basis: SpeechBasis): void {
  if (basis.contract !== "svml.speech-basis@1") throw new Error("Unsupported SpeechBasis contract.");
  assertProgramSpaceIdentity(basis.programSpace);
  assertAudioBlob(basis.audio, "SpeechBasis audio");
  if (basis.segments.length === 0 || basis.visualTrack.clips.length !== basis.segments.length) {
    throw new Error("SpeechBasis must pair every Segment with one visual clip.");
  }
  let previousEnd = 0;
  let accumulatedFrames = 0;
  const frameAt = (seconds: number): number => Math.round(
    seconds * basis.programSpace.frameRate.numerator / basis.programSpace.frameRate.denominator,
  );
  for (const [index, segment] of basis.segments.entries()) {
    const clip = basis.visualTrack.clips[index]!;
    if (!segment.segmentId || segment.startSec !== previousEnd || !Number.isFinite(segment.endSec)
      || segment.endSec <= segment.startSec || segment.endSec > basis.programSpace.durationSec) {
      throw new Error("SpeechBasis Segment is invalid or non-contiguous.");
    }
    if (clip.segmentId !== segment.segmentId || clip.artifact.kind !== "blob" || !isDigest(clip.artifact.digest)
      || !Number.isSafeInteger(clip.artifact.size) || clip.artifact.size < 0
      || !clip.artifact.mediaType.startsWith("video/")
      || clip.frameRate.numerator !== basis.programSpace.frameRate.numerator
      || clip.frameRate.denominator !== basis.programSpace.frameRate.denominator
      || !Number.isSafeInteger(clip.frameCount) || clip.frameCount <= 0) {
      throw new Error(`SpeechBasis visual clip ${clip.segmentId} is invalid.`);
    }
    assertIntrinsicExtent(clip.extent);
    const startFrame = frameAt(segment.startSec);
    const endFrame = frameAt(segment.endSec);
    if (startFrame !== accumulatedFrames || endFrame - startFrame !== clip.frameCount) {
      throw new Error(`SpeechBasis visual clip ${clip.segmentId} does not cover its Segment.`);
    }
    accumulatedFrames = endFrame;
    previousEnd = segment.endSec;
  }
  if (accumulatedFrames !== programSpaceFrameCount(basis.programSpace)) {
    throw new Error("SpeechBasis visuals do not cover ProgramSpace.");
  }
}
export function assertSpeechAudioBasisIdentity(basis: SpeechAudioBasis): void {
  if (basis.contract !== "svml.speech-audio-basis@1") throw new Error("Unsupported SpeechAudioBasis contract.");
  assertProgramSpaceIdentity(basis.programSpace);
  assertAudioBlob(basis.audio, "SpeechAudioBasis audio");
  if (basis.segments.length === 0) throw new Error("SpeechAudioBasis must contain at least one Segment.");
  let previousEnd = 0;
  for (const segment of basis.segments) {
    if (!segment.segmentId || !Number.isFinite(segment.startSec) || !Number.isFinite(segment.endSec) || segment.startSec < previousEnd
      || segment.endSec < segment.startSec || segment.endSec > basis.programSpace.durationSec) throw new Error("SpeechAudioBasis Segment is invalid or out of order.");
    previousEnd = segment.endSec;
  }
}
