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
