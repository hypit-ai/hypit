import { isDigest } from "@narratage/protocol";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@narratage/program-space";
import { assertContentFit, assertIntrinsicExtent, assertSpatialFrame } from "@narratage/spatial";
import type { SpeechAudioBasis, SpeechBasis, SpeechDuration, SpeechEvidenceAudio } from "./types.js";
function assertAudioBlob(value: SpeechBasis["audio"], label: string): void {
  if (value.kind !== "blob" || !isDigest(value.digest) || !Number.isSafeInteger(value.size)
    || value.size < 0 || value.mediaType !== "audio/wav") throw new Error(`${label} must be a canonical WAV BlobRef.`);
}
export function sealSpeechDuration(value: SpeechDuration): SpeechDuration { return value; }
export function assertSpeechDurationIdentity(value: SpeechDuration): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error("SpeechDuration is invalid.");
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
  if (value.artifact.kind !== "blob" || !isDigest(value.artifact.digest)
    || !Number.isSafeInteger(value.artifact.size) || value.artifact.size < 0 || value.artifact.mediaType !== "audio/wav"
    || !Number.isSafeInteger(value.sampleFrames) || value.sampleFrames < 1) {
    throw new Error("SpeechEvidenceAudio media identity is invalid.");
  }
}
export function assertSpeechBasisIdentity(basis: SpeechBasis): void {
  assertProgramSpaceIdentity(basis.programSpace);
  assertAudioBlob(basis.audio, "SpeechBasis audio");
  if (basis.segments.length === 0) throw new Error("SpeechBasis must contain at least one Segment.");
  let previousEnd = 0;
  const segmentIds = new Set<string>();
  for (const segment of basis.segments) {
    if (!segment.segmentId || segment.startFrame !== previousEnd
      || !Number.isSafeInteger(segment.endFrameExclusive)
      || segment.endFrameExclusive <= segment.startFrame
      || segment.endFrameExclusive > programSpaceFrameCount(basis.programSpace)) {
      throw new Error("SpeechBasis Segment is invalid or non-contiguous.");
    }
    if (segmentIds.has(segment.segmentId)) throw new Error(`SpeechBasis repeats Segment ${segment.segmentId}.`);
    segmentIds.add(segment.segmentId);
    previousEnd = segment.endFrameExclusive;
  }
  if (previousEnd !== programSpaceFrameCount(basis.programSpace)) {
    throw new Error("SpeechBasis Segments do not cover ProgramSpace.");
  }
  const seenVisuals = new Set<string>();
  for (const clip of basis.visualTrack.clips) {
    if (!segmentIds.has(clip.segmentId) || seenVisuals.has(clip.segmentId)
      || clip.artifact.kind !== "blob" || !isDigest(clip.artifact.digest)
      || !Number.isSafeInteger(clip.artifact.size) || clip.artifact.size < 0
      || !clip.artifact.mediaType.startsWith("video/")
      || !Number.isSafeInteger(clip.stackingOrder)) {
      throw new Error(`SpeechBasis visual clip ${clip.segmentId} is invalid.`);
    }
    seenVisuals.add(clip.segmentId);
    assertIntrinsicExtent(clip.extent);
    assertSpatialFrame(clip.frame);
    assertContentFit(clip.fit);
  }
}
export function assertSpeechAudioBasisIdentity(basis: SpeechAudioBasis): void {
  assertProgramSpaceIdentity(basis.programSpace);
  assertAudioBlob(basis.audio, "SpeechAudioBasis audio");
  if (basis.segments.length === 0) throw new Error("SpeechAudioBasis must contain at least one Segment.");
  let previousEnd = 0;
  const frameCount = programSpaceFrameCount(basis.programSpace);
  for (const segment of basis.segments) {
    if (!segment.segmentId || !Number.isSafeInteger(segment.startFrame)
      || !Number.isSafeInteger(segment.endFrameExclusive) || segment.startFrame < previousEnd
      || segment.endFrameExclusive < segment.startFrame || segment.endFrameExclusive > frameCount) {
      throw new Error("SpeechAudioBasis Segment is invalid or out of order.");
    }
    previousEnd = segment.endFrameExclusive;
  }
}
