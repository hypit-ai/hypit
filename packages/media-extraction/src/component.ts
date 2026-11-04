import { selectAudioStream, selectVideoStream, verifyMediaInspection } from "@hypit/media";
import { assertBlobRef, canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue, Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import { mediaExtractionProducers, mediaExtractionTypes } from "./manifest.js";
import { verifyAudioExtractionRequest, verifyFrameExtractionRequest } from "./operations.js";
import type {
  AudioExtractionRequest,
  ExtractAudioNeed,
  ExtractFrameNeed,
  FrameExtractionRequest,
} from "./types.js";

function value(value: Value, subject: string): CanonicalValue {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value;
}
function blob(value: Value, subject: string): BlobRef {
  assertBlobRef(value, subject);
  return value;
}

export const mediaExtractionComponent = {
  refinements: [{
    type: mediaExtractionTypes.audioRequest,
    handler: ({ value: input }) => verifyAudioExtractionRequest(value(input, "AudioExtractionRequest")),
  }, {
    type: mediaExtractionTypes.frameRequest,
    handler: ({ value: input }) => verifyFrameExtractionRequest(value(input, "FrameExtractionRequest")),
  }],
  producers: [{
    producer: mediaExtractionProducers.audio,
    handler: ({ inputs }) => {
      const source = blob(inputs.source!.value, "Audio extraction source");
      const inspection = value(inputs.inspection!.value, "MediaInspection");
      const request = value(inputs.request!.value, "AudioExtractionRequest") as unknown as AudioExtractionRequest;
      verifyMediaInspection(inspection);
      verifyAudioExtractionRequest(request);
      const selected = selectAudioStream(inspection, request.audio);
      const need: ExtractAudioNeed = { source, streamIndex: selected.index };
      return { kind: "need", constraints: canonicalize(need) };
    },
  }, {
    producer: mediaExtractionProducers.frame,
    handler: ({ inputs }) => {
      const source = blob(inputs.source!.value, "Frame extraction source");
      const inspection = value(inputs.inspection!.value, "MediaInspection");
      const request = value(inputs.request!.value, "FrameExtractionRequest") as unknown as FrameExtractionRequest;
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
    },
  }],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
