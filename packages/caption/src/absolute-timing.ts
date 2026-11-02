import { assertTimelineIdentity, type Timeline } from "@hypit/timeline";
import { assertCaptionTimingForDocument } from "./temporalize.js";
import type { CaptionDocument, CaptionTiming, CaptionTimingUnit } from "./types.js";

export type CaptionTimingSpec = { readonly units: readonly CaptionTimingUnit[] };

export function createAbsoluteCaptionTiming(document: CaptionDocument, timeline: Timeline, spec: CaptionTimingSpec): CaptionTiming {
  assertTimelineIdentity(timeline);
  const timing = { documentId: document.id, timelineId: timeline.id, units: spec.units };
  assertCaptionTimingForDocument(timing, document);
  if (timing.units.some(unit => unit.endFrameExclusive > timeline.frameCount)) throw new Error("Caption timing extends beyond its Timeline.");
  return timing;
}

