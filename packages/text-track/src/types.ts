import type {
  FrameSpan,
  VisualAnimation,
  VisualColorPaint,
  VisualTextDocument,
  VisualTextFlow,
  VisualTextPaintLayer,
  VisualTextSequenceAnimation,
  VisualTextTypography,
} from "@narratage/composition";
import type { SpatialFrame, SpatialPath, SpatialPoint } from "@narratage/spatial";
import type { OccurrenceExpansion, TemporalWindowProjection } from "@narratage/temporal";

export type TextDocument = VisualTextDocument;
export type TextTypography = VisualTextTypography;
export type TextPaint = VisualColorPaint;
export type TextPaintLayer = VisualTextPaintLayer;

export type TextAreaFlow = Omit<VisualTextFlow, "form">;

export type TextStyle = {
  readonly contract: "svml.text-style@1";
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
  readonly contract: "svml.text-motion@1";
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
  readonly contract: "svml.text-placement@1";
  readonly geometry: TextGeometry;
};

export type TextItemSpec = {
  readonly contract: "svml.text-item-spec@1";
  readonly id: string;
  readonly document: TextDocument;
  readonly projection: TemporalWindowProjection;
  readonly expansion: OccurrenceExpansion;
};

export type TextItem = {
  readonly id: string;
  readonly sourceOccurrenceId: string;
  readonly span: FrameSpan;
  readonly geometry: TextGeometry;
  readonly document: TextDocument;
  readonly style: TextStyle;
  readonly motion: TextMotion;
  readonly tieBreak: string;
};

export type TextTrackProgram = {
  readonly contract: "svml.text-track-program@1";
  readonly id: string;
  readonly items: readonly TextItem[];
};

/**
 * Separate graph contract for revealing one explicitly supplied owned Surface
 * through an already authored Text Program. It is not a TextStyle mode and it
 * never samples another Track or the final composite.
 */
export type TextMaskSpec = {
  readonly contract: "svml.text-mask-spec@1";
  readonly id: string;
  readonly mode: "alpha" | "luminance";
  readonly materialFit: "contain" | "cover" | "fill";
};

export type TextTrackHeader = {
  readonly contract: "svml.text-track-header@1";
  readonly id: string;
};

export type TextTrackSet = {
  readonly contract: "svml.text-track-set@1";
  readonly items: readonly TextItem[];
};
