import type { ComponentPackage, ProducerHandlerContext } from "@hypit/component-kit";
import { canonicalize } from "@hypit/protocol";
import type { StoredValue } from "@hypit/protocol";
import type { ProgramSpace } from "@hypit/program-space";
import type { CanvasSpace, SpatialFrame } from "@hypit/spatial";
import type { TemporalPoint } from "@hypit/temporal";
import type { MediaLayerSet } from "@hypit/media-track";
import type { Text } from "@hypit/text";

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

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}
const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

function finalizeInputs(inputs: ProducerHandlerContext["inputs"]) {
  return {
    set: inline<DepthStackCardSet>(inputs.set?.value, "DepthStackCardSet"),
    header: inline<DepthStackHeader>(inputs.header?.value, "DepthStackHeader"),
    frame: inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
    spec: inline<DepthStackSpec>(inputs.spec?.value, "DepthStackSpec"),
    space: inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
  };
}

export const depthStackComponent = {
  producers: [
    {
      producer: depthStackProducers.bindLabelText,
      handler: ({ inputs }) => ({ outputs: { label: output(bindDepthStackCardLabelText(
        inline<DepthStackCardLabelStyle>(inputs.style?.value, "DepthStackCardLabelStyle"),
        inline<Text>(inputs.content?.value, "Text"),
      )) }, needs: {} }),
    },
    {
      producer: depthStackProducers.createCards,
      handler: () => ({ outputs: { set: output(createDepthStackCardSet()) }, needs: {} }),
    },
    {
      producer: depthStackProducers.appendCard,
      handler: ({ inputs }) => ({ outputs: { set: output(appendDepthStackCard(
        inline<DepthStackCardSet>(inputs.set?.value, "DepthStackCardSet"),
        inline<MediaLayerSet>(inputs.material?.value, "MediaLayerSet"),
        inline<DepthStackCardLabel>(inputs.label?.value, "DepthStackCardLabel"),
        inline<DepthStackCardSpec>(inputs.spec?.value, "DepthStackCardSpec"),
        inline<TemporalPoint>(inputs.activation?.value, "TemporalPoint"),
      )) }, needs: {} }),
    },
    {
      producer: depthStackProducers.finalize,
      handler: ({ inputs }) => {
        const value = finalizeInputs(inputs);
        return { outputs: { program: output(finalizeDepthStack(
          value.set, value.header, value.frame, value.spec,
          inline<TemporalPoint>(inputs.terminal?.value, "TemporalPoint"), value.space,
        )) }, needs: {} };
      },
    },
    {
      producer: depthStackProducers.render,
      handler: ({ inputs }) => ({ outputs: { track: output(renderDepthStack(
        inline<CanvasSpace>(inputs.canvas?.value, "CanvasSpace"),
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<DepthStackProgram>(inputs.program?.value, "DepthStackProgram"),
      )) }, needs: {} }),
    },
  ],
  validators: [{
    type: depthStackTypes.program,
    handler: ({ value }) => assertDepthStackProgram(inline<DepthStackProgram>(value, "DepthStackProgram")),
  }],
} satisfies ComponentPackage;
