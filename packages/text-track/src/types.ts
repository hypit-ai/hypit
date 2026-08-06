import type { FrameSpan } from "@svml/contracts";
import type { Digest } from "@svml/protocol";

export type TextBox = {
  readonly xPercent: number;
  readonly yPercent: number;
  readonly widthPercent: number;
  readonly heightPercent: number;
};

export type TextAppearance = {
  readonly color: string;
  readonly fontSizePx: number;
  readonly fontFamily?: string;
  readonly fontWeight?: number;
  readonly lineHeight?: number;
  readonly align?: "left" | "center" | "right";
  readonly verticalAlign?: "top" | "center" | "bottom";
  readonly backgroundColor?: string;
  readonly borderRadiusPx?: number;
  readonly paddingPx?: number;
  readonly letterSpacingPx?: number;
};

export type TextItem = {
  readonly id: string;
  readonly text: string;
  readonly span: FrameSpan;
  readonly z: number;
  readonly tieBreak: string;
  readonly box: TextBox;
  readonly appearance: TextAppearance;
};

/** Package-owned authoring value. A future Text Surface or SVS recipe may produce it. */
export type TextTrackProgram = {
  readonly contract: "svml.text-track-program@1";
  readonly digest: Digest;
  readonly id: string;
  readonly programSpaceDigest: Digest;
  readonly items: readonly TextItem[];
};

export type TextTrackSpec = {
  readonly contract: "svml.text-track-spec@1";
  readonly digest: Digest;
  readonly id: string;
  readonly items: readonly {
    readonly id: string;
    readonly text: string;
    readonly during: "full";
    readonly z: number;
    readonly box: TextBox;
    readonly appearance: TextAppearance;
  }[];
};
