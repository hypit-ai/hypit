import type { FrameSpan, ProgramSpace } from "@svml/contracts";
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

/** Stable Track identity used by the graph-first Surface fold. */
export type TextTrackHeader = {
  readonly contract: "svml.text-track-header@1";
  readonly id: string;
  readonly digest: Digest;
};

/** Appearance and content are authored here; timing remains an explicit graph input. */
export type TextItemSpec = {
  readonly contract: "svml.text-item-spec@1";
  readonly id: string;
  readonly text: string;
  readonly z: number;
  readonly box: TextBox;
  readonly appearance: TextAppearance;
  readonly digest: Digest;
};

/** Package-private immutable fold value for any number of full or selected Items. */
export type TextTrackSet = {
  readonly contract: "svml.text-track-set@1";
  readonly id: string;
  readonly programSpace: ProgramSpace;
  readonly items: readonly TextItem[];
  readonly lastAddition?: {
    readonly previousSetDigest: Digest;
    readonly itemSpecDigest: Digest;
    readonly selectionDigest?: Digest;
    readonly mapDigest?: Digest;
  };
  readonly digest: Digest;
};
