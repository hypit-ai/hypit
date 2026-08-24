import type { TimedCaptionUnit } from "@hypit/caption";
import type { FontArtifactRef } from "@hypit/media";

export type FineCaptionGlyphPaint = {
  readonly fill: string;
  readonly gradient?: {
    readonly from: string;
    readonly to: string;
    readonly angleDeg: number;
  };
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
    readonly spreadPx: number;
  };
  readonly longShadow: {
    readonly color: string;
    readonly opacity: number;
    readonly distancePx: number;
    readonly angleDeg: number;
  };
  readonly glow: {
    readonly color: string;
    readonly opacity: number;
    readonly blurPx: number;
    readonly spreadPx: number;
  };
};

export type FineCaptionUnderline = {
  readonly mode: "off" | "always";
  readonly color: string;
  readonly thicknessPx: number;
  readonly offsetPx: number;
};

export type FineCaptionActiveUnderline = Omit<FineCaptionUnderline, "mode"> & {
  readonly mode: "off" | "current" | "trail";
};

export type FineCaptionBoxPaint = {
  readonly mode: "off" | "current" | "trail";
  readonly continuity: "isolated" | "joined";
  readonly background: string;
  readonly borderColor: string;
  readonly borderWidthPx: number;
  readonly paddingXPx: number;
  readonly paddingYPx: number;
  readonly radiusPx: number;
  readonly enter: FineCaptionOneShotMotion;
  readonly exit: FineCaptionOneShotMotion;
  readonly transitionFrames: number;
};

export type FineCaptionOneShotMotion =
  | "none"
  | "fade"
  | "pop"
  | "scale"
  | "spring"
  | "bounce"
  | "elastic"
  | "stamp"
  | "tilt"
  | "zoom-blur"
  | "flip-x"
  | "flip-y"
  | "spin"
  | "squash"
  | "stretch"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "blur-in"
  | "wipe-left"
  | "wipe-right"
  | "wipe-up"
  | "wipe-down";

export type FineCaptionParameters = {
  readonly stackingOrder: number;
  readonly placement: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height?: number;
    readonly anchorX: "left" | "center" | "right";
    readonly anchorY: "top" | "center" | "bottom";
  };
  readonly layout: {
    readonly textAlign: "left" | "center" | "right";
    readonly blockAlign: "start" | "center" | "end";
    readonly direction: "ltr" | "rtl";
    readonly inlineSize: "hug" | "fixed";
    readonly wrap: "word" | "grapheme";
    readonly overflow: "visible" | "clip";
    readonly maxLines?: number;
    readonly maxWordsPerLine?: number;
    readonly lineHeight: number;
    readonly letterSpacingPx: number;
    readonly wordGapPx: number;
  };
  readonly typography: {
    readonly fontSizePx: number;
    readonly kerning: "auto" | "normal" | "none";
    readonly variantCaps: "normal" | "small-caps" | "all-small-caps";
    readonly textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
    readonly exactFonts: readonly FontArtifactRef[];
  };
  readonly basePaint: FineCaptionGlyphPaint;
  readonly activePaint: FineCaptionGlyphPaint;
  readonly underline: FineCaptionUnderline;
  readonly activeUnderline: FineCaptionActiveUnderline;
  readonly cueBox: {
    readonly background: string;
    readonly borderColor: string;
    readonly borderWidthPx: number;
    readonly paddingXPx: number;
    readonly paddingYPx: number;
    readonly radiusPx: number;
    readonly shadow: {
      readonly color: string;
      readonly opacity: number;
      readonly offsetXPx: number;
      readonly offsetYPx: number;
      readonly blurPx: number;
      readonly spreadPx: number;
    };
  };
  readonly karaoke: {
    readonly mode: "off" | "current" | "trail";
    readonly transition: "step" | "wipe";
  };
  readonly activeBox: FineCaptionBoxPaint;
  readonly motion: {
    readonly cueEnter: FineCaptionOneShotMotion;
    readonly cueExit: FineCaptionOneShotMotion;
    readonly cueEnterFrames: number;
    readonly cueExitFrames: number;
    readonly atomEnter: FineCaptionOneShotMotion;
    readonly atomEnterFrames: number;
    readonly atomExit: FineCaptionOneShotMotion;
    readonly atomExitFrames: number;
    readonly atomReveal: "all" | "on-start" | "typewriter";
    readonly activeResponse: FineCaptionOneShotMotion;
    readonly activeResponseFrames: number;
    readonly activeScale: number;
    readonly slideDistancePx: number;
    readonly loop: "none" | "shake" | "wobble" | "glow-pulse" | "breathe" | "float" | "pulse" | "flicker";
    readonly loopTarget: "cue" | "active-atom";
    readonly loopPeriodFrames: number;
    readonly loopIntensity: number;
  };
  /**
   * Public rules for projecting semantic Cue time into its visible envelope.
   * The renderer never expands a Cue on its own; the package's schedule
   * Producer resolves these rules before rendering.
   */
  readonly timing: {
    readonly leadFrames: number;
    readonly tailFrames: number;
    readonly handoff: "cut" | "overlap";
  };
};

export type FineCaptionScheduledCue = {
  readonly id: string;
  readonly styleId: string;
  readonly semanticStartFrame: number;
  readonly semanticEndFrameExclusive: number;
  readonly visibleStartFrame: number;
  readonly visibleEndFrameExclusive: number;
  readonly units: readonly TimedCaptionUnit[];
};

/** Explicit projection consumed by the Fine renderer. */
export type FineCaptionSchedule = {
  readonly documentId: string;
  readonly cues: readonly FineCaptionScheduledCue[];
};
