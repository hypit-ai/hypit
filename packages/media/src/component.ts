import type { ComponentPackage } from "@narratage/component-kit";
import { verifyMediaInspection, verifyMediaStreamSelection, verifyMuxedMedia, verifyRenderedVisual, verifySynchronizedMedia, verifyTimelineAudio } from "./identity.js";
import { mediaTypes, mediaValidatorDigests } from "./manifest.js";
function inline(value: { readonly kind: string; readonly value?: unknown }, subject: string): unknown { if (value.kind !== "inline") throw new Error(`${subject} must be inline`); return value.value; }
export const mediaComponent = {
  validators: [
    { type: mediaTypes.inspection, implementationDigest: mediaValidatorDigests.inspection, handler: ({ value }) => verifyMediaInspection(inline(value, "MediaInspection")) },
    { type: mediaTypes.streamSelection, implementationDigest: mediaValidatorDigests.selection, handler: ({ value }) => verifyMediaStreamSelection(inline(value, "MediaStreamSelection")) },
    { type: mediaTypes.synchronized, implementationDigest: mediaValidatorDigests.synchronized, handler: ({ value }) => verifySynchronizedMedia(inline(value, "SynchronizedMedia")) },
    { type: mediaTypes.renderedVisual, implementationDigest: mediaValidatorDigests.renderedVisual, handler: ({ value }) => verifyRenderedVisual(inline(value, "RenderedVisual")) },
    { type: mediaTypes.timelineAudio, implementationDigest: mediaValidatorDigests.timelineAudio, handler: ({ value }) => verifyTimelineAudio(inline(value, "TimelineAudio")) },
    { type: mediaTypes.muxed, implementationDigest: mediaValidatorDigests.muxed, handler: ({ value }) => verifyMuxedMedia(inline(value, "MuxedMedia")) },
  ],
} satisfies ComponentPackage;
