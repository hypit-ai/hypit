import type { VisualAdjustment } from "@hypit/composition";

export type VisualAdjustmentHeader = { readonly id: string };

export type VisualAdjustmentSpec = {
  readonly id: string;
  readonly program: VisualAdjustment["program"];
};

export type VisualAdjustmentSet = {
  readonly items: readonly VisualAdjustment[];
};
