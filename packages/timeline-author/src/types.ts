import type { TemporalBoundaryPolicy, TemporalDuration } from "@hypit/temporal";

export type TimelineAuthorHeader = { readonly id: string };
export type ConstructionPoint = { readonly frame: number };
export type ConstructionExtent = { readonly frameCount: number };
export type TimelineAuthorBinding = {
  readonly binding: "end" | "at" | "from" | "until" | "for";
  readonly declarationId?: string;
  readonly expression?:
    | { readonly kind: "absolute" }
    | { readonly kind: "offset"; readonly base: string };
};
export type ConstructionOffsetSpec = { readonly direction: 1 | -1; readonly author?: TimelineAuthorBinding };
export type ConstructionIdentitySpec = { readonly id: string; readonly subjectId?: string };
export type ConstructionDurationSpec = { readonly duration: TemporalDuration; readonly author?: TimelineAuthorBinding };
export type ConstructionResolutionSpec = { readonly policy: TemporalBoundaryPolicy };

/** Author spelling for a boundary on one selected completed Timeline. */
export type TimelineInstantExpression =
  | { readonly ref: "timeline.start"; readonly offset?: TemporalDuration }
  | { readonly ref: "timeline.end"; readonly offset?: TemporalDuration }
  | { readonly ref: "absolute"; readonly at: TemporalDuration; readonly offset?: TemporalDuration };

export type TimelineAuthorParameter = {
  readonly binding: string;
  readonly relation: "direct" | "after-start" | "before-end";
};

export type TimelineInstantSpec = {
  readonly id: string;
  readonly subjectId: string;
  readonly projection: TimelineInstantExpression;
  readonly author?: TimelineAuthorParameter;
};

export type TimelineShiftSpec = {
  readonly id: string;
  readonly subjectId: string;
  readonly direction: 1 | -1;
  readonly resolution?: TemporalBoundaryPolicy;
  readonly author?: TimelineAuthorParameter;
};

export type TimelineInstantDeclaration = {
  readonly id: string;
  readonly kind: "instant";
  readonly at: string;
};
export type TimelineWindowDeclaration = {
  readonly id: string;
  readonly kind: "window";
  readonly from?: string;
  readonly until?: string;
  readonly duration?: string;
  readonly extentInput?: string;
};
export type TimelineAuthorDeclaration = TimelineInstantDeclaration | TimelineWindowDeclaration;

export type TimelineAuthorFragmentOptions = {
  readonly id: string;
  readonly end: string;
  readonly declarations: readonly TimelineAuthorDeclaration[];
};
