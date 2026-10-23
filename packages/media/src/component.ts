import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import { verifyMediaInspection, verifyMediaStreamSelection, verifyMuxedMedia, verifyTimelineVisual, verifySynchronizedMedia, verifyTimelineAudio } from "./identity.js";
import { mediaLocalTemporalDomain } from "./domain.js";
import type { MediaDomainSpec, SynchronizedMedia } from "./types.js";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import { mediaProducers } from "./manifest.js";
import { mediaTypes } from "./manifest.js";
import { verifyMediaFrameRange } from "./frame-range.js";
function valueOf(value: Value | undefined, subject: string): unknown { if (value === undefined) throw new Error(`${subject} is missing`); return value; }
export const mediaComponent = {
  refinements: [
    { type: mediaTypes.frameRange, handler: ({ value }) => verifyMediaFrameRange(valueOf(value, "MediaFrameRange")) },
    { type: mediaTypes.inspection, handler: ({ value }) => verifyMediaInspection(valueOf(value, "MediaInspection")) },
    { type: mediaTypes.streamSelection, handler: ({ value }) => verifyMediaStreamSelection(valueOf(value, "MediaStreamSelection")) },
    { type: mediaTypes.synchronized, handler: ({ value }) => verifySynchronizedMedia(valueOf(value, "SynchronizedMedia")) },
    { type: mediaTypes.timelineVisual, handler: ({ value }) => verifyTimelineVisual(valueOf(value, "TimelineVisual")) },
    { type: mediaTypes.timelineAudio, handler: ({ value }) => verifyTimelineAudio(valueOf(value, "TimelineAudio")) },
    { type: mediaTypes.muxed, handler: ({ value }) => verifyMuxedMedia(valueOf(value, "MuxedMedia")) },
  ],
  producers: [
    { producer: mediaProducers.localDomain, handler: ({ inputs }) => {
      const media = valueOf(inputs.media!.value, "SynchronizedMedia") as SynchronizedMedia;
      const spec = valueOf(inputs.spec!.value, "MediaDomainSpec") as MediaDomainSpec;
      return { kind: "output", value: (canonicalize(mediaLocalTemporalDomain(spec.id, media))) };
    } },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
