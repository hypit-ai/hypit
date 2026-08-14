import type { FrameSpan } from "@narratage/composition";
import type {
  FontArtifactRef,
  SynchronizedMedia,
} from "@narratage/media";
import type { BlobRef } from "@narratage/protocol";
import type { SpatialFrame } from "@narratage/spatial";

export type RankingVariant = "tier-board" | "column" | "top-three" | "typewriter-list";

export type RankingHeader = {
  readonly id: string;
  readonly variant: RankingVariant;
};

export type RankingScheduleEntry = {
  readonly itemId: string;
  readonly triggerFrame: number;
  readonly stage: FrameSpan;
  readonly cumulative: FrameSpan;
  readonly settled: FrameSpan;
};

export type RankingSchedule = {
  readonly id: string;
  readonly variant: RankingVariant;
  readonly outer: FrameSpan;
  readonly terminalFrame: number;
  readonly entries: readonly RankingScheduleEntry[];
};

export type RankingTextStyle = {
  readonly fonts: readonly FontArtifactRef[];
  readonly sizePx: number;
  readonly weight: number;
  readonly color: string;
  readonly lineHeight: number;
};

export type RankingBoardPaint = {
  readonly background: string;
  readonly borderColor: string;
  readonly borderWidthPx: number;
  readonly radiusPx: number;
  readonly shadow: {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly blurPx: number;
    readonly spreadPx: number;
    readonly color: string;
  };
};

export type RankingMotionStyle = {
  readonly appearFrames: number;
  readonly moveFrames: number;
  readonly easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
};

export type RankingSoundStyle = {
  readonly appearGain: number;
  readonly moveGain: number;
  readonly fadeFrames: number;
};

export type TierRowStyle = {
  readonly id: string;
  readonly label: string;
  readonly color: string;
};

export type TierBoardStyle = {
  readonly rows: readonly TierRowStyle[];
  readonly board: RankingBoardPaint;
  readonly text: RankingTextStyle;
  readonly labelWidthPx: number;
  readonly paddingPx: number;
  readonly rowHeightPx: number;
  readonly rowGapPx: number;
  readonly cellGapPx: number;
  readonly iconSizePx: number;
  readonly iconRadiusPx: number;
  readonly iconFit: "contain" | "cover";
  readonly stagePoint: { readonly x: number; readonly y: number };
  readonly stageSizePx: number;
  readonly motion: RankingMotionStyle;
  readonly boardStackingOrder: number;
  readonly stageStackingOrder: number;
  readonly itemStackingOrder: number;
};

export type ColumnStyle = {
  readonly board: RankingBoardPaint;
  readonly text: RankingTextStyle;
  readonly rankColors: readonly string[];
  readonly paddingPx: number;
  readonly rowHeightPx: number;
  readonly rowGapPx: number;
  readonly iconSizePx: number;
  readonly iconRadiusPx: number;
  readonly iconFit: "contain" | "cover";
  readonly stagePoint: { readonly x: number; readonly y: number };
  readonly stageSizePx: number;
  readonly motion: RankingMotionStyle;
  readonly boardStackingOrder: number;
  readonly stageStackingOrder: number;
  readonly itemStackingOrder: number;
};

export type TopThreeStyle = {
  readonly text: RankingTextStyle;
  readonly slotColors: readonly string[];
  readonly centerX: number;
  readonly baselineY: number;
  readonly slotGapPx: number;
  readonly iconSizePx: number;
  readonly iconRadiusPx: number;
  readonly iconFit: "contain" | "cover";
  readonly ringWidthPx: number;
  readonly labelGapPx: number;
  readonly motion: RankingMotionStyle;
  readonly boardStackingOrder: number;
  readonly itemStackingOrder: number;
};

export type TypewriterListStyle = {
  readonly paper: RankingBoardPaint;
  readonly title: RankingTextStyle;
  readonly item: RankingTextStyle;
  readonly emphasisColor: string;
  readonly winnerColor: string;
  readonly paddingPx: number;
  readonly rowGapPx: number;
  readonly titleGapPx: number;
  readonly rotationDeg: number;
  readonly framesPerGrapheme: number;
  readonly winnerFrames: number;
  readonly boardStackingOrder: number;
  readonly itemStackingOrder: number;
};

export type TierBoardItemSpec = {
  readonly variant: "tier-board";
  readonly id: string;
  readonly tier: string;
  readonly entry: "direct" | "stage";
  readonly stackingOrder?: number;
};

export type ColumnItemSpec = {
  readonly variant: "column";
  readonly id: string;
  readonly label: string;
  readonly stackingOrder?: number;
};

export type TopThreeItemSpec = {
  readonly variant: "top-three";
  readonly id: string;
  readonly label: string;
  readonly stackingOrder?: number;
};

export type TypewriterItemSpec = {
  readonly variant: "typewriter-list";
  readonly id: string;
  readonly text: string;
  readonly emphasis?: { readonly start: number; readonly endExclusive: number };
  readonly winner: boolean;
  readonly stackingOrder?: number;
};

export type RankingItemSpec = TierBoardItemSpec | ColumnItemSpec | TopThreeItemSpec | TypewriterItemSpec;

/** Structural half of an Item whose visible copy arrives on a Text graph edge. */
export type RankingTextItemShell =
  | Omit<ColumnItemSpec, "label">
  | Omit<TopThreeItemSpec, "label">
  | Omit<TypewriterItemSpec, "text">;

export type RankingItemSpecSet = {
  readonly variant: RankingVariant;
  readonly items: readonly RankingItemSpec[];
};

export type TierBoardItem = TierBoardItemSpec & { readonly icon: BlobRef };
export type ColumnItem = ColumnItemSpec & { readonly icon?: BlobRef };
export type TopThreeItem = TopThreeItemSpec & { readonly icon?: BlobRef };
export type TypewriterItem = TypewriterItemSpec;

export type TierBoardItemSet = {
  readonly items: readonly TierBoardItem[];
};
export type ColumnItemSet = {
  readonly items: readonly ColumnItem[];
};
export type TopThreeItemSet = {
  readonly items: readonly TopThreeItem[];
};
export type TypewriterItemSet = {
  readonly items: readonly TypewriterItem[];
};

export type TierBoardProgram = {
  readonly id: string;
  readonly frame: SpatialFrame;
  readonly schedule: RankingSchedule;
  readonly style: TierBoardStyle;
  readonly items: readonly TierBoardItem[];
};
export type ColumnProgram = {
  readonly id: string;
  readonly frame: SpatialFrame;
  readonly schedule: RankingSchedule;
  readonly style: ColumnStyle;
  readonly items: readonly ColumnItem[];
};
export type TopThreeProgram = {
  readonly id: string;
  readonly frame: SpatialFrame;
  readonly schedule: RankingSchedule;
  readonly style: TopThreeStyle;
  readonly items: readonly TopThreeItem[];
};
export type TypewriterListProgram = {
  readonly id: string;
  readonly title: string;
  readonly frame: SpatialFrame;
  readonly schedule: RankingSchedule;
  readonly style: TypewriterListStyle;
  readonly items: readonly TypewriterItem[];
};

export type RankingProgram = TierBoardProgram | ColumnProgram | TopThreeProgram | TypewriterListProgram;

export type RankingSoundEvent = {
  readonly id: string;
  readonly itemId: string;
  readonly kind: "appear" | "move";
  readonly frame: number;
};

export type RankingSoundEventPlan = {
  readonly id: string;
  readonly variant: RankingVariant;
  readonly events: readonly RankingSoundEvent[];
};

export type RankingSoundSet = {
  readonly appear?: SynchronizedMedia;
  readonly move?: SynchronizedMedia;
};
