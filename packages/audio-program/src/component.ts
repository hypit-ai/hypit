import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import { assertExactTemporalValue, compareExactTemporalValues, exactTemporalZero } from "@hypit/temporal/algebra";

import { audioProgramProducers, audioProgramTypes } from "./manifest.js";
import { verifyAudioProgram } from "./program.js";
import type { AudioProgram, RenderAudioNeed } from "./types.js";

function valueOf(value: Value | undefined, subject: string): Value {
  if (value === undefined) throw new Error(`${subject} is missing.`);
  return value;
}

function renderRangeOf(value: Value, program?: AudioProgram): NonNullable<RenderAudioNeed["range"]> {
  const range = value as unknown as NonNullable<RenderAudioNeed["range"]>;
  if (range === null || typeof range !== "object" || Array.isArray(range)) {
    throw new Error("AudioRenderRange is invalid.");
  }
  assertExactTemporalValue(range.start, "AudioRenderRange.start");
  assertExactTemporalValue(range.end, "AudioRenderRange.end");
  if (compareExactTemporalValues(range.start, exactTemporalZero()) < 0
    || compareExactTemporalValues(range.start, range.end) >= 0) {
    throw new Error("AudioRenderRange is empty or negative.");
  }
  if (program !== undefined && compareExactTemporalValues(range.end, program.domain.duration) > 0) {
    throw new Error(`AudioRenderRange exceeds Programme domain ${program.domain.id}.`);
  }
  return structuredClone(range);
}

export const audioProgramComponent = {
  refinements: [{
    type: audioProgramTypes.program,
    handler: ({ value }) => verifyAudioProgram(valueOf(value, "AudioProgram")),
  }, {
    type: audioProgramTypes.renderRange,
    handler: ({ value }) => { renderRangeOf(valueOf(value, "AudioRenderRange")); },
  }],
  producers: [
    {
      producer: audioProgramProducers.render,
      handler: ({ inputs }) => {
        const program = valueOf(inputs.program?.value, "AudioProgram");
        verifyAudioProgram(program);
        return { kind: "need", constraints: canonicalize({ program } satisfies RenderAudioNeed) };
      },
    },
    {
      producer: audioProgramProducers.renderRange,
      handler: ({ inputs }) => {
        const program = valueOf(inputs.program?.value, "AudioProgram");
        verifyAudioProgram(program);
        const range = valueOf(inputs.range?.value, "AudioRenderRange");
        return { kind: "need", constraints: canonicalize({
          program,
          range: renderRangeOf(range, program),
        } satisfies RenderAudioNeed) };
      },
    },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
