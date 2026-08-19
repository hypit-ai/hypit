import type { FrameSpan } from "@hypit/composition";
import type { FontArtifactRef } from "@hypit/media";
import type { SpatialFrame } from "@hypit/spatial";

export type LinerankHeader = {
  readonly id: string;
};

export type LinerankScheduleEntry = {
  readonly itemId: string;
  readonly rank: number;
  readonly triggerFrame: number;
};

export type LinerankSchedule = {
  readonly id: string;
  readonly windows: readonly FrameSpan[];
  readonly terminalFrame: number;
  readonly entries: readonly LinerankScheduleEntry[];
};

export type LinerankTextStyle = {
  readonly fonts: readonly FontArtifactRef[];
  readonly sizePx: number;
  readonly weight: number;
  readonly color: string;
  readonly lineHeight: number;
};

export type LinerankStyle = {
  readonly paperBackground: string;
  readonly ruleColor: string;
  readonly ruleGapPx: number;
  readonly title: LinerankTextStyle;
  readonly number: LinerankTextStyle;
  readonly label: LinerankTextStyle;
  readonly topPaddingPx: number;
  readonly leftPaddingPx: number;
  readonly rightPaddingPx: number;
  readonly rowHeightPx: number;
  readonly rowGapPx: number;
  readonly numberWidthPx: number;
  readonly typeFramesPerChar: number;
  readonly circleColor: string;
  readonly circleWidthPx: number;
  readonly circleFrames: number;
  readonly boardStackingOrder: number;
  readonly rowStackingOrder: number;
  readonly circleStackingOrder: number;
};

export type LinerankItemSpec = {
  readonly id: string;
  readonly rank: number;
  readonly label: string;
};

/** Structural half of an Item whose visible label arrives on a Text graph edge. */
export type LinerankTextItemShell = {
  readonly id: string;
  readonly rank: number;
};

export type LinerankItemSpecSet = {
  readonly items: readonly LinerankItemSpec[];
};

export type LinerankItemSet = {
  readonly items: readonly LinerankItemSpec[];
};

export type LinerankProgram = {
  readonly id: string;
  readonly frame: SpatialFrame;
  readonly schedule: LinerankSchedule;
  readonly style: LinerankStyle;
  readonly title: string;
  readonly items: readonly LinerankItemSpec[];
};
