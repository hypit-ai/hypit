export type TimedSpeechToken = {
  readonly tokenId: string;
  readonly segmentId: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};
export type SemanticTimePoint = { readonly identity: string; readonly frame: number };
/**
 * The 2M+2N point map every marker addresses, plus the Segment and Token ranges
 * consumers read windows from. Anchors are the addressing truth.
 */
export type CompleteSemanticMap = {
  readonly contract: "svml.complete-semantic-map@1";
  readonly tokens: readonly TimedSpeechToken[];
  readonly anchors: readonly SemanticTimePoint[];
};
