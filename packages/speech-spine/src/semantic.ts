import type { CompleteSemanticMap, SemanticTimePoint, TimedSpeechToken } from "@hypit/semantic-map";
import { assertSemanticTakeIdentity } from "@hypit/speech";
import type { SemanticTake } from "@hypit/speech";

/**
 * Compose local SemanticTakes in authored Spine order. The input takes already
 * own their local media frame domains; Spine only translates their coordinates
 * into one program frame domain and never re-identifies their words.
 */
export function assembleSemanticTakeMap(takes: readonly SemanticTake[]): CompleteSemanticMap {
  const tokens: TimedSpeechToken[] = [];
  const anchors: SemanticTimePoint[] = [];
  const segmentIds = new Set<string>();
  const tokenIds = new Set<string>();
  const anchorIds = new Set<string>();
  let frameRate: SemanticTake["media"]["timeline"]["frameRate"] | undefined;
  let offset = 0;
  for (const take of takes) {
    assertSemanticTakeIdentity(take);
    if (frameRate === undefined) frameRate = take.media.timeline.frameRate;
    else if (frameRate.numerator !== take.media.timeline.frameRate.numerator
      || frameRate.denominator !== take.media.timeline.frameRate.denominator) {
      throw new Error("Semantic Spine Takes must use one frame rate.");
    }
    if (segmentIds.has(take.segment.segmentId)) {
      throw new Error(`Semantic Spine repeats Segment ${take.segment.segmentId}.`);
    }
    segmentIds.add(take.segment.segmentId);
    for (const token of take.tokens) {
      if (tokenIds.has(token.tokenId)) throw new Error(`Semantic Spine repeats Token ${token.tokenId}.`);
      tokenIds.add(token.tokenId);
      tokens.push({
        tokenId: token.tokenId,
        segmentId: token.segmentId,
        startFrame: offset + token.startFrame,
        endFrameExclusive: offset + token.endFrameExclusive,
      });
    }
    for (const anchor of take.anchors) {
      if (anchorIds.has(anchor.identity)) throw new Error(`Semantic Spine repeats Anchor ${anchor.identity}.`);
      anchorIds.add(anchor.identity);
      anchors.push({ identity: anchor.identity, frame: offset + anchor.frame });
    }
    offset += take.media.timeline.frameCount;
  }
  return { tokens, anchors };
}
