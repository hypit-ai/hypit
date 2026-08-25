import { isDigest } from "@hypit/protocol";
import { verifySynchronizedMedia } from "@hypit/media";
import type { SemanticTake, SpeechDuration, SpeechEvidenceAudio } from "./types.js";
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
export function sealSpeechEvidenceAudio(value: SpeechEvidenceAudio): SpeechEvidenceAudio { return structuredClone(value); }

export function sealSemanticTake(value: SemanticTake): SemanticTake {
  const take = structuredClone(value);
  assertSemanticTakeIdentity(take);
  return take;
}

export function assertSemanticTakeIdentity(take: SemanticTake): void {
  if (!take.narrativeId.trim()) throw new Error("SemanticTake narrativeId must not be empty.");
  verifySynchronizedMedia(take.media);
  const frameCount = take.media.timeline.frameCount;
  const { segment } = take;
  if (!segment.segmentId || !segment.startAnchorId || !segment.endAnchorId
    || segment.startFrame !== 0 || segment.endFrameExclusive !== frameCount) {
    throw new Error("SemanticTake Segment must cover its local media frame domain.");
  }
  const anchorIds = new Set<string>();
  const anchorFrames = new Map<string, number>();
  for (const anchor of take.anchors) {
    if (!anchor.identity || anchorIds.has(anchor.identity) || !Number.isSafeInteger(anchor.frame)
      || anchor.frame < 0 || anchor.frame > frameCount) {
      throw new Error(`SemanticTake anchor ${anchor.identity || "<unnamed>"} is invalid.`);
    }
    anchorIds.add(anchor.identity);
    anchorFrames.set(anchor.identity, anchor.frame);
  }
  if (anchorFrames.get(segment.startAnchorId) !== 0
    || anchorFrames.get(segment.endAnchorId) !== frameCount) {
    throw new Error("SemanticTake Segment Anchors must equal its media boundaries.");
  }
  const tokenIds = new Set<string>();
  let previousStart = 0;
  let previousEnd = 0;
  for (const token of take.tokens) {
    if (!token.tokenId || !token.segmentId || token.segmentId !== segment.segmentId || !token.text
      || !token.startAnchorId || !token.endAnchorId || tokenIds.has(token.tokenId)
      || !Number.isSafeInteger(token.startFrame) || !Number.isSafeInteger(token.endFrameExclusive)
      || token.startFrame < 0 || token.endFrameExclusive < 0
      || token.startFrame > token.endFrameExclusive
      || token.startFrame > frameCount || token.endFrameExclusive > frameCount
      || token.startFrame < previousStart || token.endFrameExclusive < previousEnd) {
      throw new Error(`SemanticTake token ${token.tokenId || "<unnamed>"} is invalid.`);
    }
    if (anchorFrames.get(token.startAnchorId) !== token.startFrame
      || anchorFrames.get(token.endAnchorId) !== token.endFrameExclusive) {
      throw new Error(`SemanticTake token ${token.tokenId} disagrees with its Anchors.`);
    }
    tokenIds.add(token.tokenId);
    previousStart = token.startFrame;
    previousEnd = token.endFrameExclusive;
  }
}
export function assertSpeechEvidenceAudioIdentity(value: SpeechEvidenceAudio): void {
  if (value.artifact.kind !== "blob" || !isDigest(value.artifact.digest)
    || !Number.isSafeInteger(value.artifact.size) || value.artifact.size < 0 || value.artifact.mediaType !== "audio/wav"
    || !Number.isSafeInteger(value.sampleFrames) || value.sampleFrames < 1) {
    throw new Error("SpeechEvidenceAudio media identity is invalid.");
  }
}
