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

export type TextFinePlacement = TextFineFlowPlacement | TextFinePointPlacement;

export type TextFineNleParameters = {
  readonly typography: HtmlTextTypography;
  readonly paints: readonly HtmlTextPaintLayer[];
  readonly children: readonly HtmlTextNode[];
  readonly placement: TextFinePlacement;
};

export type TextFineNleEdit =
  | { readonly kind: "set-document"; readonly children: readonly HtmlTextNode[] }
  | {
      readonly kind: "set-style";
      readonly typography: HtmlTextTypography;
      readonly paints: readonly HtmlTextPaintLayer[];
    }
  | { readonly kind: "set-placement"; readonly placement: TextFinePlacement };
