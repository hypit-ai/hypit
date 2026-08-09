import type { FontArtifactRef } from "@narratage/media";

export type FineCaptionGlyphPaint = {
  readonly fill: string;
  readonly opacity: number;
  readonly stroke: {
    readonly color: string;
    readonly widthPx: number;
  };
  readonly shadow: {
    readonly color: string;
    readonly opacity: number;
    readonly offsetXPx: number;
    readonly offsetYPx: number;
    readonly blurPx: number;
  };
  readonly glow: {
    readonly color: string;
    readonly opacity: number;
    readonly blurPx: number;
  };
};

export type FineCaptionParameters = {
  readonly contract: "svml.caption-fine-parameters@1";
  readonly stackingOrder: number;
  readonly placement: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly anchorX: "left" | "center" | "right";
    readonly anchorY: "top" | "center" | "bottom";
  };
  readonly layout: {
    readonly textAlign: "left" | "center" | "right";
    readonly direction: "ltr" | "rtl";
    readonly lineHeight: number;
    readonly letterSpacingPx: number;
    readonly wordGapPx: number;
  };
  readonly typography: {
    readonly fontFamily: string;
    readonly fontSizePx: number;
    readonly fontWeight: number;
    readonly fontStyle: "normal" | "italic" | "oblique";
    readonly exactFont?: FontArtifactRef;
  };
  readonly basePaint: FineCaptionGlyphPaint;
  readonly activePaint: FineCaptionGlyphPaint;
  readonly cueBox: {
    readonly background: string;
    readonly borderColor: string;
    readonly borderWidthPx: number;
    readonly paddingXPx: number;
    readonly paddingYPx: number;
    readonly radiusPx: number;
  };
  readonly karaoke: {
    readonly mode: "off" | "current" | "trail";
    readonly transition: "step" | "wipe";
  };
  readonly motion: {
    readonly cueEnter: "none" | "fade";
    readonly cueExit: "none" | "fade";
    readonly cueTransitionFrames: number;
    readonly atomReveal: "all" | "on-start";
    readonly activeScale: number;
  };
};
