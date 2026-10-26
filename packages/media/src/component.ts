import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import { projectVisualDeliverySpec, verifyMediaDeliverySpec, verifyMediaInspection, verifyMediaStreamSelection, verifyMuxedMedia, verifyPreparedMedia, verifyTimelineVisual, verifyTimelineAudio, verifyVisualDeliverySpec } from "./identity.js";
import type { MediaDomainSpec, PreparedMedia } from "./types.js";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import { mediaProducers } from "./manifest.js";
import { mediaTypes } from "./manifest.js";
import { prepareMedia } from "./prepared.js";
import { assertBlobRef } from "@hypit/hypit/protocol";
function valueOf(value: Value | undefined, subject: string): unknown { if (value === undefined) throw new Error(`${subject} is missing`); return value; }
export const mediaComponent = {
  refinements: [
    { type: mediaTypes.inspection, handler: ({ value }) => verifyMediaInspection(valueOf(value, "MediaInspection")) },
    { type: mediaTypes.streamSelection, handler: ({ value }) => verifyMediaStreamSelection(valueOf(value, "MediaStreamSelection")) },
    { type: mediaTypes.prepared, handler: ({ value }) => verifyPreparedMedia(valueOf(value, "PreparedMedia")) },
    { type: mediaTypes.delivery, handler: ({ value }) => verifyMediaDeliverySpec(valueOf(value, "MediaDeliverySpec")) },
    { type: mediaTypes.visualDelivery, handler: ({ value }) => verifyVisualDeliverySpec(valueOf(value, "VisualDeliverySpec")) },
    { type: mediaTypes.timelineVisual, handler: ({ value }) => verifyTimelineVisual(valueOf(value, "TimelineVisual")) },
    { type: mediaTypes.timelineAudio, handler: ({ value }) => verifyTimelineAudio(valueOf(value, "TimelineAudio")) },
    { type: mediaTypes.muxed, handler: ({ value }) => verifyMuxedMedia(valueOf(value, "MuxedMedia")) },
  ],
  producers: [
    { producer: mediaProducers.prepare, handler: ({ inputs }) => {
      const source = valueOf(inputs.source!.value, "Prepared Media source");
      assertBlobRef(source, "Prepared Media source");
      const inspection = valueOf(inputs.inspection!.value, "MediaInspection");
      const selection = valueOf(inputs.selection!.value, "MediaStreamSelection");
      const spec = valueOf(inputs.spec!.value, "MediaDomainSpec") as MediaDomainSpec;
      verifyMediaInspection(inspection);
      verifyMediaStreamSelection(selection);
      return { kind: "output", value: canonicalize(prepareMedia({ id: spec.id, source, inspection, selection })) };
    } },
    { producer: mediaProducers.localDomain, handler: ({ inputs }) => {
      const media = valueOf(inputs.media!.value, "PreparedMedia") as PreparedMedia;
      verifyPreparedMedia(media);
      return { kind: "output", value: canonicalize(media.domain) };
    } },
    { producer: mediaProducers.visualDelivery, handler: ({ inputs }) => {
      const delivery = valueOf(inputs.delivery!.value, "MediaDeliverySpec");
      verifyMediaDeliverySpec(delivery);
      return { kind: "output", value: canonicalize(projectVisualDeliverySpec(delivery)) };
    } },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
