import type { AdmissionPackage } from "@hypit/hypit/admission";
import { plannedNeedInputs } from "@hypit/hypit/producer";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { Composition } from "@hypit/composition";
import type { Timeline } from "@hypit/timeline";
import type { CanonicalValue, StoredValue } from "@hypit/hypit/protocol";
import { canonicalize } from "@hypit/hypit/protocol";

import { compileHtmlProgram, restrictCompositionToBand } from "./document.js";
import type { PresentZBand } from "./document.js";
import type { MediaFrameRange } from "@hypit/media";
import { htmlRasterRequest } from "./execution.js";
import type { HtmlRasterRequest } from "./execution.js";
import { htmlProgramCapabilities, htmlProgramProducers } from "./manifest.js";

function inline(value: StoredValue, subject: string): CanonicalValue {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}

/** Trusted deterministic lowering only; this component never renders frames or reads Artifacts. */
export const htmlProgramComponent = {
  producers: [{
    producer: htmlProgramProducers.compile,
    handler: ({ inputs }: { inputs: Record<string, { value: StoredValue } | undefined> }) => ({
      outputs: {
        program: {
          kind: "inline",
          value: canonicalize(compileHtmlProgram(
            inline(inputs.composition!.value, "Composition") as unknown as Composition,
            inline(inputs.timeline!.value, "Timeline") as unknown as Timeline,
          )),
        },
      },
      needs: {},
    }),
  }, {
    producer: htmlProgramProducers.compileBand,
    handler: ({ inputs }: { inputs: Record<string, { value: StoredValue } | undefined> }) => ({
      outputs: {
        program: {
          kind: "inline",
          value: canonicalize(compileHtmlProgram(
            restrictCompositionToBand(
              inline(inputs.composition!.value, "Composition") as unknown as Composition,
              inline(inputs.band!.value, "PresentZBand") as unknown as PresentZBand,
            ),
            inline(inputs.timeline!.value, "Timeline") as unknown as Timeline,
          )),
        },
      },
      needs: {},
    }),
  }, ...[htmlProgramProducers.requestVisual, htmlProgramProducers.requestVisualRange].map((producer) => ({
    producer,
    handler: ({ inputs }: { inputs: Record<string, { value: StoredValue } | undefined> }) => ({
      outputs: {},
      needs: { visual: htmlRasterRequest(
        inline(inputs.program!.value, "HtmlProgram") as never,
        inputs.range === undefined ? {} : { range: inline(inputs.range.value, "MediaFrameRange") as unknown as MediaFrameRange },
      ) },
    }),
  }))],
  plannedNeeds: [htmlProgramProducers.requestVisual, htmlProgramProducers.requestVisualRange].map((producer) => ({
    producer,
    port: "visual",
    capability: htmlProgramCapabilities.rasterizeVisual,
    plan({ state, step }) { return { constraints: {}, pendingInputs: plannedNeedInputs(state, step) }; },
    present(specification) {
      const request = specification.constraints as Partial<HtmlRasterRequest>;
      if (request.program === undefined) return { fields: {}, references: {} };
      const { program, range } = request;
      return { fields: {
        width: [program.canvas.width], height: [program.canvas.height],
        startFrame: [range?.startFrame ?? 0], endFrameExclusive: [range?.endFrameExclusive ?? program.frameCount],
        frameRate: [`${program.frameRate.numerator}/${program.frameRate.denominator}`],
      }, references: {} };
    },
  })),
} satisfies ProducerPackage & AdmissionPackage;
