export type SemanticTakeAnchorAdjustment = {
  readonly anchorId: string;
  readonly frame: number;
};

export type SemanticTakeAdjustmentPlan = {
  readonly narrativeId: string;
  readonly anchors: readonly SemanticTakeAnchorAdjustment[];
};
