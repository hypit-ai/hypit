import { assertTemporalSamplingGrid, durationInFrames } from "@hypit/temporal";
import type { TemporalDuration, TemporalSamplingGrid } from "@hypit/temporal";
import { assertBlobRef, canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue, Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import { stillVideoProducers, stillVideoTypes } from "./manifest.js";
import {
  bindStillVideoSource,
  planStillVideoSegments,
  sealStillVideoRequest,
  verifyStillVideoLayout,
  verifyStillVideoRequest,
} from "./operations.js";
import type { RenderStillVideoNeed, StillVideoLayout, StillVideoRequest } from "./types.js";

function value(value: Value, subject: string): CanonicalValue {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value;
}
function blob(value: Value, subject: string): BlobRef {
  assertBlobRef(value, subject);
  return value;
}

export const stillVideoComponent = {
  refinements: [{
    type: stillVideoTypes.layout,
    handler: ({ value: input }) => verifyStillVideoLayout(value(input, "StillVideoLayout")),
  }, {
    type: stillVideoTypes.request,
    handler: ({ value: input }) => verifyStillVideoRequest(value(input, "StillVideoRequest")),
  }],
  producers: [{
    producer: stillVideoProducers.plan,
    handler: ({ inputs }) => {
      const duration = value(inputs.duration!.value, "TemporalDuration") as unknown as TemporalDuration;
      const sampling = value(inputs.sampling!.value, "TemporalSamplingGrid") as unknown as TemporalSamplingGrid;
      const layout = value(inputs.layout!.value, "StillVideoLayout") as unknown as StillVideoLayout;
      assertTemporalSamplingGrid(sampling);
      verifyStillVideoLayout(layout);
      const exactFrames = durationInFrames(duration, sampling);
      if (exactFrames.numerator <= 0n || exactFrames.denominator !== 1n
        || exactFrames.numerator > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Still video duration must resolve to a positive whole frame count");
      }
      const frameCount = Number(exactFrames.numerator);
      return { kind: "output", value: canonicalize(sealStillVideoRequest({
        frameRate: sampling.frameRate,
        frameCount,
        segments: planStillVideoSegments(frameCount, layout.weights),
      })) };
    },
  }, {
    producer: stillVideoProducers.bind,
    handler: ({ inputs }) => ({
      kind: "output",
      value: canonicalize(bindStillVideoSource(
        value(inputs.request!.value, "StillVideoRequest") as unknown as StillVideoRequest,
        blob(inputs.source!.value, "Still video source"),
      )),
    }),
  }, {
    producer: stillVideoProducers.render,
    handler: ({ inputs }) => {
      const request = value(inputs.request!.value, "StillVideoRequest") as unknown as StillVideoRequest;
      verifyStillVideoRequest(request);
      if (request.segments.some((segment) => segment.source === undefined)) {
        throw new Error("Still video has a segment without a picture");
      }
      const need: RenderStillVideoNeed = { request };
      return { kind: "need", constraints: canonicalize(need) };
    },
  }],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
