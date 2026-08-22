import type {
  FrameSpan,
  VisualAnimation,
  VisualColorPaint,
  VisualTextDocument,
  VisualTextFlow,
  VisualTextPaintLayer,
  VisualTextSequenceAnimation,
  VisualTextTypography,
} from "@hypit/composition";
import type { SpatialFrame, SpatialPath, SpatialPoint } from "@hypit/spatial";

export type TextDocument = VisualTextDocument;
export type TextTypography = VisualTextTypography;
export type TextPaint = VisualColorPaint;
export type TextPaintLayer = VisualTextPaintLayer;

export type TextAreaFlow = Omit<VisualTextFlow, "form">;

export type TextStyle = {
  readonly id: string;
  readonly stackingOrder: number;
  readonly typography: TextTypography;
  readonly paints: readonly TextPaintLayer[];
  readonly area: TextAreaFlow;
  readonly point: {
    readonly anchorInline: "start" | "center" | "end";
    readonly anchorBlock: "start" | "center" | "end";
  };
  readonly path: {
    readonly side: "left" | "right";
    readonly orientation: "follow" | "upright";
    readonly startMarginPx: number;
    readonly endMarginPx: number;
    readonly align: "start" | "center" | "end";
    readonly reverse: boolean;
    readonly overflow: "visible" | "clip";
  };
};

export type TextMotion = {
  readonly id: string;
  readonly item?: VisualAnimation;
  readonly sequences: readonly VisualTextSequenceAnimation[];
  readonly pathMargin?: {
    readonly keyframes: readonly {
      readonly atFrame: number;
      readonly startMarginPx: number;
      readonly easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
    }[];
  };
};

export type TextGeometry =
  | { readonly kind: "point"; readonly point: SpatialPoint }
  | { readonly kind: "area"; readonly frame: SpatialFrame }
  | { readonly kind: "path"; readonly path: SpatialPath };

export type TextPlacement = {
  readonly geometry: TextGeometry;
};

export type TextItemSpec = {
  readonly id: string;
  readonly document: TextDocument;
};

/**
 * Author/runtime-independent part of one plain-text item. The actual copy is
 * supplied by an ordinary @hypit/text Text edge and materialized into a
 * TextItemSpec before temporal projection.
 */
export type PlainTextItemSpec = {
  readonly id: string;
};

export type TextItem = {
  readonly id: string;
  readonly span: FrameSpan;
  readonly geometry: TextGeometry;
  readonly document: TextDocument;
  readonly style: TextStyle;
  readonly motion: TextMotion;
  readonly tieBreak: string;
};

export type TypographyTrackProgram = {
  readonly id: string;
  readonly items: readonly TextItem[];
};

/**
 * Separate graph contract for revealing one explicitly supplied owned Surface
 * through an already authored Text Program. It is not a TextStyle mode and it
 * never samples another Track or the final composite.
 */
export type TextMaskSpec = {
  readonly id: string;
  readonly mode: "alpha" | "luminance";
  readonly materialFit: "contain" | "cover" | "fill";
};

export type TypographyTrackHeader = {
  readonly id: string;
};

export type TypographyTrackSet = {
  readonly items: readonly TextItem[];
};
