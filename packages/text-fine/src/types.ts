import type {
  VisualColorPaint,
  VisualTextDocument,
  VisualTextFlow,
  VisualTextPaintLayer,
  VisualTextSequenceAnimation,
  VisualTextTypography,
} from "@hypit/composition";
import type { HtmlAnimation as VisualAnimation } from "@hypit/html-program";
import type { FrameSpan } from "@hypit/timeline";
import type { SpatialFrame, SpatialPath, SpatialPoint } from "@hypit/spatial";

export type TextDocument = VisualTextDocument;
export type TextTypography = VisualTextTypography;
export type TextPaint = VisualColorPaint;
export type TextPaintLayer = VisualTextPaintLayer;

export type TextAreaFlow = Omit<VisualTextFlow, "form">;

export type TextStyle = {
  readonly id: string;
  readonly typography: TextTypography;
  readonly paints: readonly TextPaintLayer[];
};

export type TextMotion = {
  readonly id: string;
  readonly item?: VisualAnimation;
  readonly sequences: readonly VisualTextSequenceAnimation[];
};

export type TextPathMotion = {
  readonly id: string;
  readonly keyframes: readonly {
    readonly atFrame: number;
    readonly startMarginPx: number;
    readonly easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  }[];
};

export type TextFlowPlacementPolicy = {
  readonly flow: TextAreaFlow;
};

export type TextPointPlacementPolicy = {
  readonly anchorInline: "start" | "center" | "end";
  readonly anchorBlock: "start" | "center" | "end";
};

export type TextPathPlacementPolicy = {
  readonly side: "left" | "right";
  readonly orientation: "follow" | "upright";
  readonly startMarginPx: number;
  readonly endMarginPx: number;
  readonly align: "start" | "center" | "end";
  readonly reverse: boolean;
  readonly overflow: "visible" | "clip";
};

export type TextPlacement =
  | {
      readonly kind: "flow";
      readonly frame: SpatialFrame;
    } & TextFlowPlacementPolicy
  | {
      readonly kind: "point";
      readonly point: SpatialPoint;
    } & TextPointPlacementPolicy
  | {
      readonly kind: "path";
      readonly path: SpatialPath;
      readonly marginMotion?: TextPathMotion;
    } & TextPathPlacementPolicy;

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
  readonly placement: TextPlacement;
  readonly document: TextDocument;
  readonly style: TextStyle;
  readonly motion: TextMotion;
};

/**
 * One independently authored fine-text occurrence. It is a package-owned
 * compiled value for authoring and Studio projection, not a Core Track or a
 * second temporal model. Its span has already been resolved on `timelineId`.
 */
export type FineTextOccurrence = TextItem & {
  readonly timelineId: string;
};

/**
 * Separate graph contract for revealing one explicitly supplied owned Surface
 * through one already authored fine-text occurrence. It is not a TextStyle
 * mode and it never samples another Track or the final composite.
 */
export type TextMaskSpec = {
  readonly id: string;
  readonly mode: "alpha" | "luminance";
  readonly materialFit: "contain" | "cover" | "fill";
};
