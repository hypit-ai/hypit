import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { CanonicalValue, Value } from "@hypit/hypit/protocol";

import { assertHtmlProgram } from "./program.js";
import type { HtmlProgram } from "./types.js";
import type { FrameSpan } from "@hypit/temporal";
import { verifyVisualDeliverySpec } from "@hypit/media";
import type { VisualDeliverySpec } from "@hypit/media";
import { htmlRasterRequest, verifyHtmlFrameImages } from "./execution.js";
import { htmlProgramProducers, htmlProgramTypes } from "./manifest.js";

function valueOf(value: Value, subject: string): CanonicalValue {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value;
}

/** Trusted deterministic lowering only; this component never renders frames or reads Artifacts. */
export const htmlProgramComponent = {
  producers: [htmlProgramProducers.requestVisual, htmlProgramProducers.requestVisualRange].map((producer) => ({
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
  })),
  refinements: [
    { type: htmlProgramTypes.program, handler: ({ value }) => assertHtmlProgram(value as unknown as HtmlProgram) },
    { type: htmlProgramTypes.frameImages, handler: ({ value }) => verifyHtmlFrameImages(value) },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
