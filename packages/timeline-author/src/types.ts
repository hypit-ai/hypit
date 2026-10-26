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
