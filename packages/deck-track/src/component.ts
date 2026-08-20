import type { ComponentPackage, ProducerHandlerContext } from "@hypit/component-kit";
import { canonicalize } from "@hypit/protocol";
import type { StoredValue } from "@hypit/protocol";
import type { SemanticTrack } from "@hypit/semantic-track";
import { projectSemanticProgramSpace } from "@hypit/semantic-track";
import type { CanvasSpace, SpatialFrame } from "@hypit/spatial";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import type { MediaLayerSet } from "@hypit/media-track";
import type { Text } from "@hypit/text";

import { renderDepthStack } from "./lower.js";
import { depthStackProducers, depthStackTypes } from "./manifest.js";
import { appendDepthStackMomentCard, assertDepthStackProgram, createDepthStackCardSet, finalizeDepthStackAtProgramEnd, finalizeDepthStackUntilMoment, finalizeDepthStackUntilSelection, bindDepthStackCardLabelText } from "./program.js";
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
    semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
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
      producer: depthStackProducers.appendMomentCard,
      handler: ({ inputs }) => ({ outputs: { set: output(appendDepthStackMomentCard(
        inline<DepthStackCardSet>(inputs.set?.value, "DepthStackCardSet"),
        inline<MediaLayerSet>(inputs.material?.value, "MediaLayerSet"),
        inline<DepthStackCardLabel>(inputs.label?.value, "DepthStackCardLabel"),
        inline<DepthStackCardSpec>(inputs.spec?.value, "DepthStackCardSpec"),
        inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
        inline<NarrativeMomentRef>(inputs.moment?.value, "NarrativeMomentRef"),
      )) }, needs: {} }),
    },
    {
      producer: depthStackProducers.finalizeProgramEnd,
      handler: ({ inputs }) => {
        const value = finalizeInputs(inputs);
        return { outputs: { program: output(finalizeDepthStackAtProgramEnd(
          value.set, value.header, value.frame, value.spec, value.semantic,
        )) }, needs: {} };
      },
    },
    {
      producer: depthStackProducers.finalizeUntilMoment,
      handler: ({ inputs }) => {
        const value = finalizeInputs(inputs);
        return { outputs: { program: output(finalizeDepthStackUntilMoment(
          value.set, value.header, value.frame, value.spec,
          value.semantic,
          inline<NarrativeMomentRef>(inputs.terminal?.value, "NarrativeMomentRef"),
        )) }, needs: {} };
      },
    },
    ...([depthStackProducers.finalizeUntilSelectionStart, depthStackProducers.finalizeUntilSelectionEnd] as const)
      .map((producer, index) => ({
        producer,
        handler: ({ inputs }: ProducerHandlerContext) => {
          const value = finalizeInputs(inputs);
          return { outputs: { program: output(finalizeDepthStackUntilSelection(
            value.set, value.header, value.frame, value.spec,
            value.semantic,
            inline<NarrativeSelectionRef>(inputs.terminal?.value, "NarrativeSelectionRef"),
            index === 0 ? "start" : "end",
          )) }, needs: {} };
        },
      })),
    {
      producer: depthStackProducers.render,
      handler: ({ inputs }) => ({ outputs: { track: output(renderDepthStack(
        inline<CanvasSpace>(inputs.canvas?.value, "CanvasSpace"),
        projectSemanticProgramSpace(inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack")),
        inline<DepthStackProgram>(inputs.program?.value, "DepthStackProgram"),
      )) }, needs: {} }),
    },
  ],
  validators: [{
    type: depthStackTypes.program,
    handler: ({ value }) => assertDepthStackProgram(inline<DepthStackProgram>(value, "DepthStackProgram")),
  }],
} satisfies ComponentPackage;
