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
