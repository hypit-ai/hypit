import type { FrameSpan } from "@hypit/composition";
import type { FontArtifactRef } from "@hypit/media";
import type { BlobRef } from "@hypit/protocol";
import type { SpatialFrame } from "@hypit/spatial";
import type { OccurrenceExpansion, TemporalWindowProjection } from "@hypit/temporal";

export type CommentStickerTextStyle = {
  readonly fonts: readonly FontArtifactRef[];
  readonly sizePx: number;
  readonly weight: number;
  readonly lineHeight: number;
  readonly color: string;
};

export type CommentStickerStyle = {
  readonly id: string;
  readonly stackingOrder: number;
  readonly card: {
    readonly background: string;
    readonly borderColor: string;
    readonly borderWidthPx: number;
    readonly radiusPx: number;
    readonly paddingXPx: number;
    readonly paddingYPx: number;
    readonly gapPx: number;
    readonly rotationDeg: number;
    readonly shadow: {
      readonly color: string;
      readonly offsetX: number;
      readonly offsetY: number;
      readonly blurPx: number;
      readonly spreadPx: number;
    };
    readonly tail: {
      readonly enabled: boolean;
      readonly widthPx: number;
      readonly heightPx: number;
      readonly offsetXPx: number;
    };
  };
  readonly avatar: {
    readonly fallback: "none" | "initial";
    readonly sizePx: number;
    readonly borderWidthPx: number;
    readonly borderColor: string;
    readonly background: string;
    readonly textColor: string;
  };
  readonly header: CommentStickerTextStyle;
  readonly body: CommentStickerTextStyle & { readonly maxLines: number };
  readonly meta: CommentStickerTextStyle;
  readonly motion: {
    readonly enter: {
      readonly kind: "none" | "fade" | "pop" | "slide-pop";
      readonly durationFrames: number;
      readonly offsetYPx: number;
      readonly startScale: number;
      readonly rotationDeltaDeg: number;
      readonly easing: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "out-back";
    };
    readonly exit: {
      readonly kind: "none" | "fade" | "fade-up";
      readonly durationFrames: number;
      readonly offsetYPx: number;
      readonly easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
    };
    readonly hold: {
      readonly kind: "none" | "float";
      readonly amplitudeYPx: number;
      readonly rotationAmplitudeDeg: number;
      readonly periodFrames: number;
    };
  };
};

export type CommentStickerContent = {
  readonly comment: string;
  readonly author?: string;
  readonly header?: string;
  readonly meta?: string;
};

export type CommentStickerItemSpec = {
  readonly id: string;
  readonly projection: TemporalWindowProjection;
  readonly expansion: OccurrenceExpansion;
};

export type CommentStickerHeader = {
  readonly id: string;
};

export type CommentStickerItemProgram = {
  readonly id: string;
  readonly span: FrameSpan;
  readonly frame: SpatialFrame;
  readonly style: CommentStickerStyle;
  readonly content: CommentStickerContent;
  readonly avatar?: BlobRef;
  readonly tieBreak: string;
};

export type CommentStickerSet = {
  readonly items: readonly CommentStickerItemProgram[];
};

export type CommentStickerProgram = {
  readonly id: string;
  readonly items: readonly CommentStickerItemProgram[];
};
