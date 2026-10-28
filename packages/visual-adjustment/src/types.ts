import type { VisualAdjustment } from "@hypit/composition";

export type VisualAdjustmentHeader = { readonly id: string };

/** A reusable unary Picture effect supplied by an official, project or ecosystem package. */
export type VisualAdjustmentEffect = VisualAdjustment["program"];

export type VisualAdjustmentSpec = {
  readonly id: string;
  readonly effect: VisualAdjustmentEffect;
};

export type VisualAdjustmentSet = {
  readonly items: readonly VisualAdjustment[];
};
