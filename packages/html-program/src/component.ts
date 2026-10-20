import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { Composition } from "@hypit/composition";
import type { Timeline } from "@hypit/timeline";
import type { CanonicalValue, Value } from "@hypit/hypit/protocol";
import { canonicalize } from "@hypit/hypit/protocol";

import { compileHtmlProgram } from "./document.js";
import type { MediaFrameRange } from "@hypit/media";
import { htmlRasterRequest } from "./execution.js";
import { htmlProgramProducers } from "./manifest.js";

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
            valueOf(inputs.timeline!.value, "Timeline") as unknown as Timeline,
          ))) }),
  }, ...[htmlProgramProducers.requestVisual, htmlProgramProducers.requestVisualRange].map((producer) => ({
    producer,
    handler: ({ inputs }: { inputs: Record<string, { value: Value } | undefined> }) => ({ kind: "need" as const, constraints: htmlRasterRequest(
        valueOf(inputs.program!.value, "HtmlProgram") as never,
        inputs.range === undefined ? {} : { range: valueOf(inputs.range.value, "MediaFrameRange") as unknown as MediaFrameRange },
      ) }),
  }))],
} satisfies ProducerPackage & RefinementPackage;
