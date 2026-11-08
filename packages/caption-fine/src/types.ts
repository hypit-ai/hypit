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

export type CaptionFineStyleParameters = {
  /** Exact project-owned font bytes. fontFamily is only an explicit environment fallback. */
  readonly fonts?: FontStackRef;
  readonly color?: string;
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
  readonly cueBox?: CaptionFineBoxParameters;
  readonly activeBox?: CaptionFineActiveBoxParameters;
  readonly underline?: CaptionFineUnderlineParameters;
  readonly activeUnderline?: CaptionFineActiveUnderlineParameters;
  readonly karaoke?: CaptionFineKaraokeParameters;
  readonly entry?: {
    readonly kind?: "none" | "fade" | "pop" | "slide-up";
    readonly frames?: number;
  };
  readonly attributeFaces?: readonly CaptionFineAttributeFace[];
};

export type CaptionStyle = SharedCaptionStyle<"fine">;
export type CaptionPresentation = SharedCaptionPresentation<"fine">;
