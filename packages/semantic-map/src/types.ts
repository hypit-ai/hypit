export type AlignmentRelation = "exact" | "split" | "merge" | "replacement" | "source-omission" | "evidence-insertion";
/** How the aligner paired one Script run with one evidence run. Working data, not a map field. */
export type AlignmentGroup = { readonly sourceSegmentId: string; readonly sourceTokenIds: readonly string[]; readonly evidenceWordStart: number; readonly evidenceWordEndExclusive: number; readonly relation: AlignmentRelation; readonly cost: number };
export type TimedSpeechToken = { readonly tokenId: string; readonly segmentId: string; readonly startSec: number; readonly endSec: number; readonly startFrame: number; readonly endFrame: number };
export type TimedSpeechSegment = { readonly segmentId: string; readonly startSec: number; readonly endSec: number; readonly startFrame: number; readonly endFrame: number };
export type SemanticTimePoint = { readonly identity: string; readonly timeSec: number; readonly frame: number };
/**
 * The 2M+2N point map every marker addresses, plus the Segment and Token ranges
 * consumers read windows from. Anchors are the addressing truth.
 */
export type CompleteSemanticMap = {
  readonly contract: "svml.complete-semantic-map@1";
  readonly segments: readonly TimedSpeechSegment[];
  readonly tokens: readonly TimedSpeechToken[];
  readonly anchors: readonly SemanticTimePoint[];
};
