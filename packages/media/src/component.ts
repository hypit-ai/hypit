import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import { projectVisualDeliverySpec, verifyHdrStaticMetadata, verifyMediaDeliverySpec, verifyMediaDomainSpec, verifyMediaInspection, verifyMediaStreamSelection, verifyMuxedMedia, verifyPictureInterpretation, verifyPreparedMedia, verifyTimelineVisual, verifyTimelineAudio, verifyVisualDeliverySpec, verifyWorkingPictureSpec } from "./identity.js";
import type { MediaDomainSpec, PreparedMedia } from "./types.js";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import { mediaProducers } from "./manifest.js";
import { mediaTypes } from "./manifest.js";
import { prepareMedia } from "./prepared.js";
import { assertBlobRef } from "@hypit/hypit/protocol";
import { assertCompositableSurfaceRef, assertFontArtifactRef, assertFontStackRef } from "./render.js";
function valueOf(value: Value | undefined, subject: string): unknown { if (value === undefined) throw new Error(`${subject} is missing`); return value; }
export const mediaComponent = {
  refinements: [
    { type: mediaTypes.inspection, handler: ({ value }) => verifyMediaInspection(valueOf(value, "MediaInspection")) },
    { type: mediaTypes.streamSelection, handler: ({ value }) => verifyMediaStreamSelection(valueOf(value, "MediaStreamSelection")) },
    { type: mediaTypes.prepared, handler: ({ value }) => verifyPreparedMedia(valueOf(value, "PreparedMedia")) },
    { type: mediaTypes.pictureInterpretation, handler: ({ value }) => verifyPictureInterpretation(valueOf(value, "PictureInterpretation")) },
    { type: mediaTypes.workingPicture, handler: ({ value }) => verifyWorkingPictureSpec(valueOf(value, "WorkingPictureSpec")) },
    { type: mediaTypes.hdrStaticMetadata, handler: ({ value }) => verifyHdrStaticMetadata(valueOf(value, "HdrStaticMetadata")) },
    { type: mediaTypes.delivery, handler: ({ value }) => verifyMediaDeliverySpec(valueOf(value, "MediaDeliverySpec")) },
    { type: mediaTypes.visualDelivery, handler: ({ value }) => verifyVisualDeliverySpec(valueOf(value, "VisualDeliverySpec")) },
    { type: mediaTypes.timelineVisual, handler: ({ value }) => verifyTimelineVisual(valueOf(value, "TimelineVisual")) },
    { type: mediaTypes.timelineAudio, handler: ({ value }) => verifyTimelineAudio(valueOf(value, "TimelineAudio")) },
    { type: mediaTypes.muxed, handler: ({ value }) => verifyMuxedMedia(valueOf(value, "MuxedMedia")) },
    { type: mediaTypes.domainSpec, handler: ({ value }) => verifyMediaDomainSpec(valueOf(value, "MediaDomainSpec")) },
    { type: mediaTypes.fontArtifact, handler: ({ value }) => assertFontArtifactRef(
      valueOf(value, "FontArtifactRef") as Parameters<typeof assertFontArtifactRef>[0],
    ) },
    { type: mediaTypes.fontStack, handler: ({ value }) => assertFontStackRef(
      valueOf(value, "FontStackRef") as Parameters<typeof assertFontStackRef>[0],
    ) },
    { type: mediaTypes.compositableSurface, handler: ({ value }) => assertCompositableSurfaceRef(
      valueOf(value, "CompositableSurfaceRef") as Parameters<typeof assertCompositableSurfaceRef>[0],
    ) },
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
      verifyMediaDomainSpec(spec);
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
