import type { ComponentPackage, ProducerHandlerContext } from "@hypit/component-kit";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import type { ProgramSpace } from "@hypit/program-space";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, StoredValue } from "@hypit/protocol";
import type { CompleteSemanticMap } from "@hypit/semantic-map";
import type { SpatialFrame } from "@hypit/spatial";
import type { Text } from "@hypit/text";

import { notepadProducers, notepadTypes } from "./manifest.js";
import { renderNotepadList } from "./render.js";
import {
  appendNotepadRowSpec,
  assertNotepadProgram,
  assertNotepadSchedule,
  buildNotepadProgram,
  buildNotepadSchedule,
  createNotepadRowSpecSet,
  materializeNotepadRow,
} from "./schedule.js";
import type {
  NotepadHeader,
  NotepadProgram,
  NotepadRowShell,
  NotepadRowSpec,
  NotepadRowSpecSet,
  NotepadSchedule,
  NotepadStyle,
  NotepadTitleSpec,
} from "./types.js";

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}

function blob(value: StoredValue | undefined, label: string): BlobRef {
  if (value?.kind !== "blob") throw new Error(`${label} must be a blob Artifact.`);
  return value;
}

const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

function scheduleHandler(opened: boolean) {
  return ({ inputs }: ProducerHandlerContext) => ({
    outputs: {
      schedule: output(buildNotepadSchedule({
        header: inline<NotepadHeader>(inputs.header?.value, "NotepadHeader"),
        rows: inline<NotepadRowSpecSet>(inputs.rows?.value, "NotepadRowSpecSet"),
        map: inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
        space: inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
        during: inline<NarrativeSelectionRef>(inputs.during?.value, "NarrativeSelectionRef"),
        triggers: inline<NarrativeMomentRef>(inputs.triggers?.value, "NarrativeMomentRef"),
        terminal: inline<NarrativeMomentRef>(inputs.terminal?.value, "NarrativeMomentRef"),
        ...(opened
          ? { opening: inline<NarrativeSelectionRef>(inputs.opening?.value, "NarrativeSelectionRef") }
          : {}),
      })),
    },
    needs: {},
  });
}

export const notepadComponent = {
  producers: [
    {
      producer: notepadProducers.createRows,
      handler: ({ inputs }) => ({
        outputs: { set: output(createNotepadRowSpecSet(inline<NotepadHeader>(inputs.header?.value, "NotepadHeader"))) },
        needs: {},
      }),
    },
    {
      producer: notepadProducers.appendRow,
      handler: ({ inputs }) => ({
        outputs: { set: output(appendNotepadRowSpec(
          inline<NotepadRowSpecSet>(inputs.set?.value, "NotepadRowSpecSet"),
          inline<NotepadRowSpec>(inputs.spec?.value, "NotepadRowSpec"),
        )) },
        needs: {},
      }),
    },
    {
      producer: notepadProducers.materializeRow,
      handler: ({ inputs }) => ({
        outputs: { spec: output(materializeNotepadRow(
          inline<NotepadRowShell>(inputs.shell?.value, "NotepadRowShell"),
          inline<Text>(inputs.content?.value, "Text"),
        )) },
        needs: {},
      }),
    },
    { producer: notepadProducers.schedule, handler: scheduleHandler(false) },
    { producer: notepadProducers.openedSchedule, handler: scheduleHandler(true) },
    {
      producer: notepadProducers.program,
      handler: ({ inputs }) => ({
        outputs: { program: output(buildNotepadProgram(
          inline<NotepadHeader>(inputs.header?.value, "NotepadHeader"),
          inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
          blob(inputs.surface?.value, "Notepad surface"),
          inline<NotepadSchedule>(inputs.schedule?.value, "NotepadSchedule"),
          inline<NotepadStyle>(inputs.style?.value, "NotepadStyle"),
          inline<NotepadTitleSpec>(inputs.title?.value, "NotepadTitleSpec"),
          inline<NotepadRowSpecSet>(inputs.rows?.value, "NotepadRowSpecSet"),
        )) },
        needs: {},
      }),
    },
    {
      producer: notepadProducers.render,
      handler: ({ inputs }) => ({
        outputs: { track: output(renderNotepadList(
          inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
          inline<NotepadProgram>(inputs.program?.value, "NotepadProgram"),
        )) },
        needs: {},
      }),
    },
  ],
  validators: [
    { type: notepadTypes.schedule,
      handler: ({ value }) => assertNotepadSchedule(inline<NotepadSchedule>(value, "NotepadSchedule")) },
    { type: notepadTypes.program,
      handler: ({ value }) => assertNotepadProgram(inline<NotepadProgram>(value, "NotepadProgram")) },
  ],
} satisfies ComponentPackage;
