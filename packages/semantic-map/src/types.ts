export type TimingQuality = "measured" | "derived" | "estimated";
export type AlignmentRelation = "exact" | "split" | "merge" | "replacement" | "source-omission" | "evidence-insertion";
export type AlignmentGroup = { readonly sourceSegmentId: string; readonly sourceTokenIds: readonly string[]; readonly evidenceWordStart: number; readonly evidenceWordEndExclusive: number; readonly relation: AlignmentRelation; readonly cost: number };
export type TimedSpeechToken = { readonly tokenId: string; readonly segmentId: string; readonly startSec: number; readonly endSec: number; readonly startFrame: number; readonly endFrame: number; readonly startQuality: TimingQuality; readonly endQuality: TimingQuality };
export type TimedSpeechSegment = { readonly segmentId: string; readonly startSec: number; readonly endSec: number; readonly startFrame: number; readonly endFrame: number; readonly startQuality: TimingQuality; readonly endQuality: TimingQuality };
export type SemanticTimePoint = { readonly identity: string; readonly timeSec: number; readonly frame: number; readonly quality: TimingQuality };
export type CompleteSemanticMap = { readonly contract: "svml.complete-semantic-map@1"; readonly quantizationPolicy: "nearest-frame"; readonly durationSec: number;
  readonly segments: readonly TimedSpeechSegment[]; readonly tokens: readonly TimedSpeechToken[]; readonly anchors: readonly SemanticTimePoint[]; readonly groups: readonly AlignmentGroup[] };
