export type CanvasSpace = {
  readonly contract: "svml.canvas-space@1";
  readonly widthPx: number;
  readonly heightPx: number;
  readonly origin: "top-left";
  readonly xDirection: "right";
  readonly yDirection: "down";
  readonly pixelAspect: "square";
};

export type SpatialPoint = {
  readonly contract: "svml.spatial-point@1";
  readonly xPx: number;
  readonly yPx: number;
};

export type SpatialFrame = {
  readonly contract: "svml.spatial-frame@1";
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
};

export type SpatialPathCommand =
  | { readonly kind: "move"; readonly xPx: number; readonly yPx: number }
  | { readonly kind: "line"; readonly xPx: number; readonly yPx: number }
  | { readonly kind: "quadratic"; readonly controlX: number; readonly controlY: number; readonly xPx: number; readonly yPx: number }
  | { readonly kind: "cubic"; readonly control1X: number; readonly control1Y: number; readonly control2X: number; readonly control2Y: number; readonly xPx: number; readonly yPx: number }
  | { readonly kind: "close" };

export type SpatialPath = {
  readonly contract: "svml.spatial-path@1";
  readonly commands: readonly SpatialPathCommand[];
};

export type IntrinsicExtent = {
  readonly contract: "svml.intrinsic-extent@1";
  readonly widthPx: number;
  readonly heightPx: number;
};

export type NormalizedPoint = {
  readonly x: number;
  readonly y: number;
};

export type ContentFit = {
  readonly contract: "svml.content-fit@1";
  readonly sizing: "contain" | "cover" | "fit-width" | "fit-height" | "native" | "scale-down" | "stretch";
  readonly framePoint: NormalizedPoint;
  readonly contentPoint: NormalizedPoint;
  readonly offsetPx: { readonly x: number; readonly y: number };
  readonly constraint: "bounded" | "free";
};

export type FittedContent = {
  readonly contract: "svml.fitted-content@1";
  readonly contentFrame: SpatialFrame;
};

export type SpatialLength = {
  readonly unit: "px" | "percent";
  readonly value: number;
};

export type FrameEdgesProgram = {
  readonly contract: "svml.frame-edges-program@1";
  readonly left: SpatialLength;
  readonly top: SpatialLength;
  readonly right: SpatialLength;
  readonly bottom: SpatialLength;
};

export type SpatialAnchor =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export type AnchoredFrameProgram = {
  readonly contract: "svml.anchored-frame-program@1";
  readonly x: SpatialLength;
  readonly y: SpatialLength;
  readonly width: SpatialLength;
  readonly height: SpatialLength;
  readonly anchor: SpatialAnchor;
  readonly offsetPx: { readonly x: number; readonly y: number };
};

export type AspectFrameProgram = {
  readonly contract: "svml.aspect-frame-program@1";
  readonly x: SpatialLength;
  readonly y: SpatialLength;
  readonly primary: "width" | "height";
  readonly size: SpatialLength;
  readonly anchor: SpatialAnchor;
  readonly offsetPx: { readonly x: number; readonly y: number };
};
