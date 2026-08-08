export type FineCaptionParameters = {
  readonly contract: "svml.caption-fine-parameters@1";
  readonly stackingOrder: number;
  readonly placement: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
  };
  readonly typography: {
    readonly fontFamily: string;
    readonly fontSizePx: number;
    readonly fontWeight: number;
    readonly lineHeight: number;
    readonly textAlign: "left" | "center" | "right";
    readonly fill: string;
  };
  readonly box: {
    readonly background: string;
    readonly paddingXPx: number;
    readonly paddingYPx: number;
    readonly radiusPx: number;
  };
  readonly important: {
    readonly fill: string;
    readonly scale: number;
  };
};
