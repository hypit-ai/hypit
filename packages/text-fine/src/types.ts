import type {
  HtmlTextNode,
  HtmlTextPaintLayer,
  HtmlTextTypography,
} from "@hypit/html-program";

export type TextFineFlowPlacement = {
  readonly kind: "flow";
  readonly paddingPx: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly inlineAlign: "left" | "center" | "right" | "justify";
  readonly blockAlign: "start" | "center" | "end";
  readonly wrap: "none" | "word" | "grapheme";
  readonly overflow: "visible" | "clip" | "ellipsis" | "shrink";
  readonly maxLines?: number;
  readonly minimumScale?: number;
  readonly columns: number;
  readonly columnGapPx: number;
};

export type TextFinePointPlacement = {
  readonly kind: "point";
  readonly x: number;
  readonly y: number;
  readonly anchorInline: "start" | "center" | "end";
  readonly anchorBlock: "start" | "center" | "end";
};

export type TextFinePathCommand =
  | { readonly kind: "move" | "line"; readonly x: number; readonly y: number }
  | {
      readonly kind: "quadratic";
      readonly controlX: number;
      readonly controlY: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: "cubic";
      readonly control1X: number;
      readonly control1Y: number;
      readonly control2X: number;
      readonly control2Y: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly kind: "close" };

export type TextFinePathPlacement = {
  readonly kind: "path";
  readonly commands: readonly TextFinePathCommand[];
  readonly side: "left" | "right";
  readonly orientation: "follow" | "upright";
  readonly startMarginPx: number;
  readonly endMarginPx: number;
  readonly align: "start" | "center" | "end";
  readonly reverse: boolean;
  readonly overflow: "visible" | "clip";
  readonly marginAnimation?: {
    readonly keyframes: readonly {
      readonly atFrame: number;
      readonly startMarginPx: number;
      readonly easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
    }[];
  };
};

export type TextFinePlacement = TextFineFlowPlacement | TextFinePointPlacement | TextFinePathPlacement;

export type TextFineSequenceState = {
  readonly opacity?: number;
  readonly translateXPx?: number;
  readonly translateYPx?: number;
  readonly scale?: number;
  readonly rotateDeg?: number;
  readonly skewXDeg?: number;
  readonly skewYDeg?: number;
  readonly blurPx?: number;
  readonly clipInsetPercent?: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
};

export type TextFineSequence = {
  readonly id: string;
  /** Original Text node identities. Omit to animate every Text node. */
  readonly nodes?: readonly string[];
  readonly unit: "node" | "word" | "grapheme";
  readonly order: "forward" | "reverse";
  readonly startFrame: number;
  readonly durationFrames: number;
  readonly staggerFrames: number;
  readonly cycles: number;
  readonly keyframes: readonly {
    readonly atProgress: number;
    readonly easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
    readonly state: TextFineSequenceState;
  }[];
};

export type TextFineNleParameters = {
  readonly typography: HtmlTextTypography;
  readonly paints: readonly HtmlTextPaintLayer[];
  readonly children: readonly HtmlTextNode[];
  readonly placement: TextFinePlacement;
  readonly sequences?: readonly TextFineSequence[];
};

export type TextFineNleEdit =
  | { readonly kind: "set-document"; readonly children: readonly HtmlTextNode[] }
  | {
      readonly kind: "set-style";
      readonly typography: HtmlTextTypography;
      readonly paints: readonly HtmlTextPaintLayer[];
    }
  | { readonly kind: "set-placement"; readonly placement: TextFinePlacement }
  | { readonly kind: "set-sequences"; readonly sequences: readonly TextFineSequence[] };
