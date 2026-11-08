import type {
  CaptionPresentation as SharedCaptionPresentation,
  CaptionStyle as SharedCaptionStyle,
} from "@hypit/caption-nle";

export type CaptionFineKaraokeParameters = {
  readonly mode?: "off" | "current" | "trail";
  readonly transition?: "step" | "wipe";
  readonly activeColor?: string;
};

export type CaptionFineBoxParameters = {
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

export type CaptionFineAttributeFace = {
  readonly attribute: string;
  readonly value: string | number | boolean;
  readonly fontFamily?: string;
  readonly fontWeight?: number;
  readonly fontStyle?: "normal" | "italic";
};

export type CaptionFineStyleParameters = {
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
  readonly karaoke?: CaptionFineKaraokeParameters;
  readonly entry?: {
    readonly kind?: "none" | "fade" | "pop" | "slide-up";
    readonly frames?: number;
  };
  readonly attributeFaces?: readonly CaptionFineAttributeFace[];
};

export type CaptionStyle = SharedCaptionStyle<"fine">;
export type CaptionPresentation = SharedCaptionPresentation<"fine">;
