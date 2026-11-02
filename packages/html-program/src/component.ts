import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { Composition } from "@hypit/composition";
import type { CanonicalValue, Value } from "@hypit/hypit/protocol";
import { canonicalize } from "@hypit/hypit/protocol";

import { compileHtmlProgram } from "./document.js";
import { assertHtmlProgram } from "./document.js";
import type { HtmlProgram } from "./types.js";
import { assertFrameSpan } from "@hypit/timeline";
import type { FrameSpan } from "@hypit/timeline";
import { verifyVisualDeliverySpec } from "@hypit/media";
import type { VisualDeliverySpec } from "@hypit/media";
import { htmlRasterRequest, verifyHtmlFrameImages, htmlFrameRequest } from "./execution.js";
import { htmlProgramProducers, htmlProgramTypes } from "./manifest.js";

function valueOf(value: Value, subject: string): CanonicalValue {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value;
}

/** Trusted deterministic lowering only; this component never renders frames or reads Artifacts. */
export const htmlProgramComponent = {
  producers: [{
    producer: htmlProgramProducers.compile,
    handler: ({ inputs }: { inputs: Record<string, { value: Value } | undefined> }) => ({ kind: "output" as const, value: (canonicalize(compileHtmlProgram(
          valueOf(inputs.composition!.value, "Composition") as unknown as Composition,
          ))) }),
  }, ...[htmlProgramProducers.requestVisual, htmlProgramProducers.requestVisualRange].map((producer) => ({
    producer,
    handler: ({ inputs }: { inputs: Record<string, { value: Value } | undefined> }) => {
      const delivery = valueOf(inputs.delivery!.value, "VisualDeliverySpec") as unknown as VisualDeliverySpec;
      verifyVisualDeliverySpec(delivery);
      return { kind: "need" as const, constraints: htmlRasterRequest(
        valueOf(inputs.program!.value, "HtmlProgram") as never,
        delivery,
        inputs.range === undefined ? {} : { range: valueOf(inputs.range.value, "FrameSpan") as unknown as FrameSpan },
      ) };
    },
  })), {
    producer: htmlProgramProducers.requestFrame,
    handler: ({ inputs }) => {
      const range = valueOf(inputs.range!.value, "FrameSpan") as unknown as FrameSpan;
      assertFrameSpan(range);
      if (range.endFrameExclusive !== range.startFrame + 1) throw new Error("Frame capture selects exactly one frame");
      return { kind: "need", constraints: htmlFrameRequest({
        program: valueOf(inputs.program!.value, "HtmlProgram") as unknown as HtmlProgram,
        picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alpha: { mode: "straight" } },
        frames: [range.startFrame],
      }) };
    },
  }, {
    producer: htmlProgramProducers.projectFrame,
    handler: ({ inputs }) => {
      const images = valueOf(inputs.frames!.value, "FrameImages");
      verifyHtmlFrameImages(images);
      const range = valueOf(inputs.range!.value, "FrameSpan") as unknown as FrameSpan;
      assertFrameSpan(range);
      if (range.endFrameExclusive !== range.startFrame + 1 || images.frames.length !== 1 || images.frames[0]!.frame !== range.startFrame) throw new Error("Captured frame does not match its selected position");
      return { kind: "output", value: images.frames[0]!.artifact };
    },
  }],
  refinements: [
    { type: htmlProgramTypes.program, handler: ({ value }) => assertHtmlProgram(value as unknown as HtmlProgram) },
    { type: htmlProgramTypes.frameImages, handler: ({ value }) => verifyHtmlFrameImages(value) },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
