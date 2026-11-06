import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import { projectVisualDeliverySpec, verifyMediaDeliverySpec, verifyMediaDomainSpec, verifyMediaInspection, verifyMediaStreamSelection, verifyMuxedMedia, verifyPictureInterpretation, verifyPreparedMedia, verifyTimelineVisual, verifyTimelineAudio, verifyVisualDeliverySpec } from "./identity.js";
import type { AudioExtractionRequest, ExtractAudioNeed, ExtractFrameNeed, FrameExtractionRequest, InspectMediaNeed, MediaDomainSpec, MediaInspection, MediaSelectionRequest, PreparedMedia } from "./types.js";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import { mediaProducers } from "./manifest.js";
import { mediaTypes } from "./manifest.js";
import { prepareMedia } from "./prepared.js";
import { assertBlobRef } from "@hypit/hypit/protocol";
import { assertFontArtifactRef, assertFontStackRef } from "./render.js";
import { selectAudioStream, selectMediaStreams, selectVideoStream, verifyMediaSelectionRequest } from "./selection.js";
import { verifyAudioExtractionRequest, verifyFrameExtractionRequest } from "./extraction.js";
function valueOf(value: Value | undefined, subject: string): unknown { if (value === undefined) throw new Error(`${subject} is missing`); return value; }
export const mediaComponent = {
  refinements: [
    { type: mediaTypes.inspection, handler: ({ value }) => verifyMediaInspection(valueOf(value, "MediaInspection")) },
    { type: mediaTypes.selectionRequest, handler: ({ value }) => verifyMediaSelectionRequest(valueOf(value, "MediaSelectionRequest")) },
    { type: mediaTypes.audioExtractionRequest, handler: ({ value }) => verifyAudioExtractionRequest(valueOf(value, "AudioExtractionRequest")) },
    { type: mediaTypes.frameExtractionRequest, handler: ({ value }) => verifyFrameExtractionRequest(valueOf(value, "FrameExtractionRequest")) },
    { type: mediaTypes.streamSelection, handler: ({ value }) => verifyMediaStreamSelection(valueOf(value, "MediaStreamSelection")) },
    { type: mediaTypes.prepared, handler: ({ value }) => verifyPreparedMedia(valueOf(value, "PreparedMedia")) },
    { type: mediaTypes.pictureInterpretation, handler: ({ value }) => verifyPictureInterpretation(valueOf(value, "PictureInterpretation")) },
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
  ],
  producers: [
    { producer: mediaProducers.resource, handler: ({ inputs }) => {
      const resource = valueOf(inputs.resource!.value, "Media Resource");
      assertBlobRef(resource, "Media Resource");
      return { kind: "output", value: resource };
    } },
    { producer: mediaProducers.inspect, handler: ({ inputs }) => {
      const source = valueOf(inputs.source!.value, "Media inspection source");
      assertBlobRef(source, "Media inspection source");
      const need: InspectMediaNeed = { source };
      return { kind: "need", constraints: canonicalize(need) };
    } },
    { producer: mediaProducers.extractAudio, handler: ({ inputs }) => {
      const source = valueOf(inputs.source!.value, "Audio extraction source");
      assertBlobRef(source, "Audio extraction source");
      const inspection = valueOf(inputs.inspection!.value, "MediaInspection") as MediaInspection;
      const request = valueOf(inputs.request!.value, "AudioExtractionRequest") as AudioExtractionRequest;
      verifyMediaInspection(inspection);
      verifyAudioExtractionRequest(request);
      const selected = selectAudioStream(inspection, request.audio);
      const need: ExtractAudioNeed = { source, streamIndex: selected.index };
      return { kind: "need", constraints: canonicalize(need) };
    } },
    { producer: mediaProducers.extractFrame, handler: ({ inputs }) => {
      const source = valueOf(inputs.source!.value, "Frame extraction source");
      assertBlobRef(source, "Frame extraction source");
      const inspection = valueOf(inputs.inspection!.value, "MediaInspection") as MediaInspection;
      const request = valueOf(inputs.request!.value, "FrameExtractionRequest") as FrameExtractionRequest;
      verifyMediaInspection(inspection);
      verifyFrameExtractionRequest(request);
      const selected = selectVideoStream(inspection, request.video);
      if (request.at.kind === "frame" && request.at.index >= selected.decodedUnitCount) {
        throw new Error(`Frame ${request.at.index} is outside the selected stream (${selected.decodedUnitCount} frames)`);
      }
      const need: ExtractFrameNeed = {
        source,
        streamIndex: selected.index,
        sourceFrameCount: selected.decodedUnitCount,
        at: request.at,
      };
      return { kind: "need", constraints: canonicalize(need) };
    } },
    { producer: mediaProducers.select, handler: ({ inputs }) => {
      const inspection = valueOf(inputs.inspection!.value, "MediaInspection") as MediaInspection;
      const request = valueOf(inputs.request!.value, "MediaSelectionRequest") as MediaSelectionRequest;
      verifyMediaInspection(inspection);
      verifyMediaSelectionRequest(request);
      return { kind: "output", value: canonicalize(selectMediaStreams(inspection, request)) };
    } },
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
      if (media.domain === undefined) throw new Error("PreparedMedia has no temporal domain");
      return { kind: "output", value: canonicalize(media.domain) };
    } },
    { producer: mediaProducers.visualDelivery, handler: ({ inputs }) => {
      const delivery = valueOf(inputs.delivery!.value, "MediaDeliverySpec");
      verifyMediaDeliverySpec(delivery);
      return { kind: "output", value: canonicalize(projectVisualDeliverySpec(delivery)) };
    } },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
