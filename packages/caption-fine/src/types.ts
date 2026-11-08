import type {
  CaptionPresentation as SharedCaptionPresentation,
  CaptionStyle as SharedCaptionStyle,
} from "@hypit/caption-nle";
import type { FontStackRef } from "@hypit/media";

export type CaptionFineKaraokeParameters = {
  readonly mode?: "off" | "current" | "trail";
  readonly transition?: "step" | "wipe";
  readonly activeColor?: string;
};

export type CaptionFineBoxParameters = {
  readonly continuity?: "isolated" | "joined";
  readonly background?: string;
  readonly borderColor?: string;
  readonly borderWidth?: number;
  readonly borderRadius?: number;
  readonly paddingX?: number;
  readonly paddingY?: number;
};

export type CaptionFineActiveBoxParameters = CaptionFineBoxParameters & {
  readonly mode?: "off" | "current" | "trail";
};

export type CaptionFineUnderlineParameters = {
  readonly mode?: "off" | "always";
  readonly color?: string;
  readonly thickness?: number;
  readonly offset?: number;
  readonly style?: "solid" | "double" | "dotted" | "dashed" | "wavy";
};

export type CaptionFineActiveUnderlineParameters = Omit<CaptionFineUnderlineParameters, "mode"> & {
  readonly mode?: "off" | "current" | "trail";
};

export type CaptionFineAttributeFace = {
  readonly attribute: string;
  readonly value: string | number | boolean;
  readonly fontFamily?: string;
  readonly fontWeight?: number;
  readonly fontStyle?: "normal" | "italic";
};

export type CaptionFineOneShotMotion =
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

export type CaptionFineLoopMotion =
  | "none"
  | "shake"
  | "wobble"
  | "glow-pulse"
  | "breathe"
  | "float"
  | "pulse"
  | "flicker";

export type CaptionFineStyleParameters = {
  /** Exact project-owned font bytes. fontFamily is only an explicit environment fallback. */
  readonly fonts?: FontStackRef;
  readonly color?: string;
  readonly opacity?: number;
  readonly gradient?: {
    readonly from: string;
    readonly to: string;
    readonly angleDeg?: number;
  };
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontWeight?: number;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly wordGap?: number;
  readonly textAlign?: "left" | "center" | "right";
  readonly outlineColor?: string;
  readonly outlineWidth?: number;
  readonly shadowColor?: string;
  readonly shadowBlur?: number;
  readonly shadowOffsetX?: number;
  readonly shadowOffsetY?: number;
  readonly shadowSpread?: number;
  readonly glow?: {
    readonly color?: string;
    readonly opacity?: number;
    readonly blur?: number;
    readonly spread?: number;
  };
  readonly longShadow?: {
    readonly color?: string;
    readonly opacity?: number;
    readonly distance?: number;
    readonly angleDeg?: number;
    readonly steps?: number;
  };
  readonly cueBox?: CaptionFineBoxParameters;
  readonly activeBox?: CaptionFineActiveBoxParameters;
  readonly underline?: CaptionFineUnderlineParameters;
  readonly activeUnderline?: CaptionFineActiveUnderlineParameters;
  readonly karaoke?: CaptionFineKaraokeParameters;
  readonly entry?: {
    readonly kind?: CaptionFineOneShotMotion;
    readonly frames?: number;
  };
  readonly exit?: {
    readonly kind?: CaptionFineOneShotMotion;
    readonly frames?: number;
  };
  readonly atom?: {
    readonly enter?: CaptionFineOneShotMotion;
    readonly enterFrames?: number;
    readonly exit?: CaptionFineOneShotMotion;
    readonly exitFrames?: number;
    readonly reveal?: "all" | "on-start" | "typewriter";
  };
  readonly activeResponse?: {
    readonly kind?: CaptionFineOneShotMotion;
    readonly frames?: number;
    readonly scale?: number;
  };
  readonly loop?: {
    readonly kind?: CaptionFineLoopMotion;
    readonly target?: "cue" | "active-atom";
    readonly periodFrames?: number;
    readonly intensity?: number;
  };
  readonly slideDistance?: number;
  readonly attributeFaces?: readonly CaptionFineAttributeFace[];
};

export type CaptionStyle = SharedCaptionStyle<"fine">;
export type CaptionPresentation = SharedCaptionPresentation<"fine">;
