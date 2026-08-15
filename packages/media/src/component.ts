import type { ComponentPackage } from "@narratage/component-kit";
import { verifyMediaInspection, verifyMediaStreamSelection, verifyMuxedMedia, verifyRenderedVisual, verifySynchronizedMedia, verifyTimelineAudio } from "./identity.js";
import { mediaTypes } from "./manifest.js";
function inline(value: { readonly kind: string; readonly value?: unknown }, subject: string): unknown { if (value.kind !== "inline") throw new Error(`${subject} must be inline`); return value.value; }
export const mediaComponent = {
  validators: [
    { type: mediaTypes.inspection, handler: ({ value }) => verifyMediaInspection(inline(value, "MediaInspection")) },
    { type: mediaTypes.streamSelection, handler: ({ value }) => verifyMediaStreamSelection(inline(value, "MediaStreamSelection")) },
    { type: mediaTypes.synchronized, handler: ({ value }) => verifySynchronizedMedia(inline(value, "SynchronizedMedia")) },
    { type: mediaTypes.renderedVisual, handler: ({ value }) => verifyRenderedVisual(inline(value, "RenderedVisual")) },
    { type: mediaTypes.timelineAudio, handler: ({ value }) => verifyTimelineAudio(inline(value, "TimelineAudio")) },
    { type: mediaTypes.muxed, handler: ({ value }) => verifyMuxedMedia(inline(value, "MuxedMedia")) },
  ],
} satisfies ComponentPackage;
