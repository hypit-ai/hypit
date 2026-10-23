import type { Timeline } from "@hypit/timeline";
import { canonicalize } from "@hypit/hypit/protocol";
import type { ProducerPackage, ProducerHandlerContext } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { Value } from "@hypit/hypit/protocol";
import type { SpatialFrame } from "@hypit/spatial";
import type { TemporalInstant } from "@hypit/temporal";
import type { MediaLayerSet } from "@hypit/visual-track";
import type { Text } from "@hypit/hypit/text";

import { renderDepthStack } from "./lower.js";
import { depthStackProducers, depthStackTypes } from "./manifest.js";
import { appendDepthStackCard, assertDepthStackProgram, createDepthStackCardSet, finalizeDepthStack, bindDepthStackCardLabelText } from "./program.js";
import type {
  DepthStackCardLabel,
  DepthStackCardLabelStyle,
  DepthStackCardSet,
  DepthStackCardSpec,
  DepthStackHeader,
  DepthStackProgram,
  DepthStackSpec,
} from "./types.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}
const output = (value: unknown) => ((canonicalize(value)));

function finalizeInputs(inputs: ProducerHandlerContext["inputs"]) {
  return {
    set: valueOf<DepthStackCardSet>(inputs.set?.value, "DepthStackCardSet"),
    header: valueOf<DepthStackHeader>(inputs.header?.value, "DepthStackHeader"),
    frame: valueOf<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
    spec: valueOf<DepthStackSpec>(inputs.spec?.value, "DepthStackSpec"),
    timeline: valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
  };
}

export const depthStackComponent = {
  producers: [
    {
      producer: depthStackProducers.bindLabelText,
      handler: ({ inputs }) => ({ kind: "output", value: output(bindDepthStackCardLabelText(
        valueOf<DepthStackCardLabelStyle>(inputs.style?.value, "DepthStackCardLabelStyle"),
        valueOf<Text>(inputs.content?.value, "Text"),
      )) }),
    },
    {
      producer: depthStackProducers.createCards,
      handler: () => ({ kind: "output", value: output(createDepthStackCardSet()) }),
    },
    {
      producer: depthStackProducers.appendCard,
      handler: ({ inputs }) => ({ kind: "output", value: output(appendDepthStackCard(
        valueOf<DepthStackCardSet>(inputs.set?.value, "DepthStackCardSet"),
        valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        valueOf<MediaLayerSet>(inputs.material?.value, "MediaLayerSet"),
        valueOf<DepthStackCardLabel>(inputs.label?.value, "DepthStackCardLabel"),
        valueOf<DepthStackCardSpec>(inputs.spec?.value, "DepthStackCardSpec"),
        valueOf<TemporalInstant>(inputs.activation?.value, "TemporalInstant"),
      )) }),
    },
    {
      producer: depthStackProducers.finalize,
      handler: ({ inputs }) => {
        const value = finalizeInputs(inputs);
        return { kind: "output", value: output(finalizeDepthStack(
          value.set, value.header, value.frame, value.spec,
          valueOf<TemporalInstant>(inputs.terminal?.value, "TemporalInstant"), value.timeline,
        )) };
      },
    },
    {
      producer: depthStackProducers.render,
      handler: ({ inputs }) => ({ kind: "output", value: output(renderDepthStack(
        valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        valueOf<DepthStackProgram>(inputs.program?.value, "DepthStackProgram"),
      )) }),
    },
  ],
  refinements: [{
    type: depthStackTypes.program,
    handler: ({ value }) => assertDepthStackProgram(valueOf<DepthStackProgram>(value, "DepthStackProgram")),
  }],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
