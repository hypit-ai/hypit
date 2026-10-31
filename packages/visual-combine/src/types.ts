import type { VisualItem, VisualTrack } from "@hypit/composition";

export type VisualCombineHeader = { readonly id: string };
export type VisualCombineUseSpec = { readonly id: string };
export type VisualCombineUse = {
  readonly spec: VisualCombineUseSpec;
  readonly track: VisualTrack;
};

/** Package-private balanced lowering value; never an authored Track or retained Result. */
export type VisualCombineBlock = {
  readonly timelineId: string;
  /** Namespaces still participating in this construction block; consumed by balanced merge validation. */
  readonly useIds: readonly string[];
  readonly items: readonly VisualItem[];
};
