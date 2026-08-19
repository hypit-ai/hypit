import type { ComponentPackage, ProducerHandlerContext } from "@hypit/component-kit";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import type { ProgramSpace } from "@hypit/program-space";
import { canonicalize } from "@hypit/protocol";
import type { StoredValue } from "@hypit/protocol";
import type { CompleteSemanticMap } from "@hypit/semantic-map";
import type { SpatialFrame } from "@hypit/spatial";
import type { Text } from "@hypit/text";

import { linerankProducers, linerankTypes } from "./manifest.js";
import {
  appendLinerankItem,
  appendLinerankItemSpec,
  assertLinerankItemSpec,
  assertLinerankProgram,
  assertLinerankSchedule,
  buildLinerankProgram,
  buildLinerankSchedule,
  createLinerankItemSet,
  createLinerankItemSpecSet,
  materializeLinerankTextItem,
} from "./schedule.js";
import { renderLinerankBoard } from "./render.js";
import type {
  LinerankHeader,
  LinerankItemSet,
  LinerankItemSpec,
  LinerankItemSpecSet,
  LinerankProgram,
  LinerankSchedule,
  LinerankStyle,
  LinerankTextItemShell,
} from "./types.js";

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}

const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

export const linerankComponent: ComponentPackage = {
  producers: [
    {
      producer: linerankProducers.materializeTextItem,
      handler: ({ inputs }) => ({ outputs: { spec: output(materializeLinerankTextItem(
        inline<LinerankTextItemShell>(inputs.shell?.value, "LinerankTextItemShell"),
        inline<Text>(inputs.content?.value, "Text"),
      )) }, needs: {} }),
    },
    {
      producer: linerankProducers.createSpecs,
      handler: () => ({ outputs: { set: output(createLinerankItemSpecSet()) }, needs: {} }),
    },
    {
      producer: linerankProducers.appendSpec,
      handler: ({ inputs }) => ({ outputs: { set: output(appendLinerankItemSpec(
        inline<LinerankItemSpecSet>(inputs.set?.value, "LinerankItemSpecSet"),
        inline<LinerankItemSpec>(inputs.spec?.value, "LinerankItemSpec"),
      )) }, needs: {} }),
    },
    {
      producer: linerankProducers.schedule,
      handler: ({ inputs }) => ({ outputs: { schedule: output(buildLinerankSchedule({
        header: inline<LinerankHeader>(inputs.header?.value, "LinerankHeader"),
        items: inline<LinerankItemSpecSet>(inputs.items?.value, "LinerankItemSpecSet"),
        map: inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
        space: inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        outer: inline<NarrativeSelectionRef>(inputs.outer?.value, "NarrativeSelectionRef"),
        triggers: inline<NarrativeMomentRef>(inputs.triggers?.value, "NarrativeMomentRef"),
        terminal: inline<NarrativeMomentRef>(inputs.terminal?.value, "NarrativeMomentRef"),
      })) }, needs: {} }),
    },
    {
      producer: linerankProducers.createItems,
      handler: () => ({ outputs: { set: output(createLinerankItemSet()) }, needs: {} }),
    },
    {
      producer: linerankProducers.appendItem,
      handler: ({ inputs }) => ({ outputs: { set: output(appendLinerankItem(
        inline<LinerankItemSet>(inputs.set?.value, "LinerankItemSet"),
        inline<LinerankItemSpec>(inputs.spec?.value, "LinerankItemSpec"),
      )) }, needs: {} }),
    },
    {
      producer: linerankProducers.program,
      handler: ({ inputs }) => ({ outputs: { program: output(buildLinerankProgram(
        inline<LinerankHeader>(inputs.header?.value, "LinerankHeader"),
        inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
        inline<LinerankSchedule>(inputs.schedule?.value, "LinerankSchedule"),
        inline<LinerankStyle>(inputs.style?.value, "LinerankStyle"),
        inline<Text>(inputs.title?.value, "Text").value,
        inline<LinerankItemSet>(inputs.set?.value, "LinerankItemSet"),
      )) }, needs: {} }),
    },
    {
      producer: linerankProducers.render,
      handler: ({ inputs }: ProducerHandlerContext) => ({ outputs: { track: output(renderLinerankBoard(
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        inline<LinerankProgram>(inputs.program?.value, "LinerankProgram"),
      )) }, needs: {} }),
    },
  ],
  validators: [
    { type: linerankTypes.schedule,
      handler: ({ value }) => assertLinerankSchedule(inline<LinerankSchedule>(value, "LinerankSchedule")) },
    { type: linerankTypes.program,
      handler: ({ value }) => assertLinerankProgram(inline<LinerankProgram>(value, "LinerankProgram")) },
  ],
};
