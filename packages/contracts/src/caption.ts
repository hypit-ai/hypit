import type { TimingQuality } from "./speech.js";
import type { Digest } from "@svml/protocol";

export type TimedCaptionRefinement = {
  readonly id: string;
  readonly display: string;
  readonly displayStart: number;
  readonly displayEnd: number;
  readonly sourceTokenIds: readonly string[];
  readonly startSec: number;
  readonly endSec: number;
  readonly startQuality: TimingQuality;
  readonly endQuality: TimingQuality;
  readonly relation: "exact";
};

export type TimedCaptionRegion = {
  readonly id: string;
  readonly display: string;
  readonly segmentId: string;
  readonly kind: "identity" | "alias" | "hidden";
  readonly sourceTokenIds: readonly string[];
  readonly startSec: number;
  readonly endSec: number;
  readonly startQuality: TimingQuality;
  readonly endQuality: TimingQuality;
  readonly refinements: readonly TimedCaptionRefinement[];
};

export type TimedCaptionProjection = {
  readonly contract: "svml.timed-caption-projection@1";
  readonly semanticIndexDigest: Digest;
  readonly speechTimeMapDigest: Digest;
  readonly text: string;
  readonly regions: readonly TimedCaptionRegion[];
  readonly projectionDigest: Digest;
};

export type CaptionPresentationMode = "whole" | "proportional-word" | "character-flow";

export type CaptionPresentationUnit = {
  readonly id: string;
  readonly regionId: string;
  readonly display: string;
  readonly displayStart: number;
  readonly displayEnd: number;
  readonly startSec: number;
  readonly endSec: number;
  readonly basis: "region-envelope" | "exact-correspondence" | "presentation-estimate";
  readonly timingQuality: TimingQuality;
};

export type CaptionPresentationPlan = {
  readonly contract: "svml.caption-presentation-plan@0";
  readonly sourceProjectionDigest: Digest;
  readonly mode: CaptionPresentationMode;
  readonly units: readonly CaptionPresentationUnit[];
  readonly planDigest: Digest;
};
