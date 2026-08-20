export type TimedSpeechToken = {
  readonly tokenId: string;
  readonly segmentId: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};
export type SemanticTimePoint = { readonly identity: string; readonly frame: number };
/**
 * The point map every marker addresses, plus the Segment and Token ranges
 * consumers read windows from. For `m` Segments and `n` Tokens this contains
 * `2m + 2n` structural boundaries; one Segment with `k` Tokens therefore has
 * `2 + 2k` anchors. Anchors are the addressing truth.
 */
export type CompleteSemanticMap = {
  readonly tokens: readonly TimedSpeechToken[];
  readonly anchors: readonly SemanticTimePoint[];
};
