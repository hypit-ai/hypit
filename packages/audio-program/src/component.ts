import { assertCompositionIdentity } from "@hypit/composition";
import type { Composition } from "@hypit/composition";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import { assertFrameSpan } from "@hypit/timeline";

import { audioProgramProducers, audioProgramTypes } from "./manifest.js";
import { compileAudioProgram, verifyAudioProgram } from "./program.js";
import type { RenderAudioNeed } from "./types.js";

function valueOf(value: Value | undefined, subject: string): Value {
  if (value === undefined) throw new Error(`${subject} is missing.`);
  return value;
}

export const audioProgramComponent = {
  refinements: [{
    type: audioProgramTypes.program,
    handler: ({ value }) => verifyAudioProgram(valueOf(value, "AudioProgram")),
  }],
  producers: [
    {
      producer: audioProgramProducers.compile,
      handler: ({ inputs }) => {
        const composition = valueOf(inputs.composition?.value, "Composition") as unknown as Composition;
        assertCompositionIdentity(composition);
        return { kind: "output", value: canonicalize(compileAudioProgram(composition)) };
      },
    },
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
        const range = valueOf(inputs.range?.value, "FrameSpan");
        assertFrameSpan(range, program.frameCount);
        return { kind: "need", constraints: canonicalize({ program, range } satisfies RenderAudioNeed) };
      },
    },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
