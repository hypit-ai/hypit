import { isDigest } from "@hypit/protocol";
import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@hypit/program-space";
import { verifySynchronizedMedia } from "@hypit/media";
import { assertContentFit, assertIntrinsicExtent, assertSpatialFrame } from "@hypit/spatial";
import type { SemanticTake, SpeechBasis, SpeechDuration, SpeechEvidenceAudio } from "./types.js";
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

export function sealSemanticTake(value: SemanticTake): SemanticTake { return structuredClone(value); }

export function assertSemanticTakeIdentity(take: SemanticTake): void {
  verifySynchronizedMedia(take.media);
  const frameCount = take.media.timeline.frameCount;
  const { segment } = take;
  if (!segment.segmentId || !segment.startAnchorId || !segment.endAnchorId
    || segment.startFrame !== 0 || segment.endFrameExclusive !== frameCount) {
    throw new Error("SemanticTake Segment must cover its local media frame domain.");
  }
  const tokenIds = new Set<string>();
  const referencedAnchorIds = new Set<string>([segment.startAnchorId, segment.endAnchorId]);
  for (const token of take.tokens) {
    if (!token.tokenId || !token.segmentId || token.segmentId !== segment.segmentId || !token.text
      || !token.startAnchorId || !token.endAnchorId || tokenIds.has(token.tokenId)
      || !Number.isSafeInteger(token.startFrame) || !Number.isSafeInteger(token.endFrameExclusive)
      || token.startFrame < 0 || token.endFrameExclusive < 0
      || token.startFrame > frameCount || token.endFrameExclusive > frameCount) {
      throw new Error(`SemanticTake token ${token.tokenId || "<unnamed>"} is invalid.`);
    }
    referencedAnchorIds.add(token.startAnchorId);
    referencedAnchorIds.add(token.endAnchorId);
    tokenIds.add(token.tokenId);
  }
  const anchorIds = new Set<string>();
  for (const anchor of take.anchors) {
    if (!anchor.identity || anchorIds.has(anchor.identity) || !Number.isSafeInteger(anchor.frame)
      || anchor.frame < 0 || anchor.frame > frameCount) {
      throw new Error(`SemanticTake anchor ${anchor.identity || "<unnamed>"} is invalid.`);
    }
    anchorIds.add(anchor.identity);
  }
  for (const anchorId of referencedAnchorIds) {
    if (!anchorIds.has(anchorId)) throw new Error(`SemanticTake is missing referenced Anchor ${anchorId}.`);
  }
}
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
