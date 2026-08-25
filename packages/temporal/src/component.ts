import type { ComponentPackage, ProducerHandlerContext } from "@hypit/component-kit";
import { canonicalize } from "@hypit/protocol";
import type { StoredValue } from "@hypit/protocol";
import type { NarrativeExcerpt, NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import type { SemanticTrack } from "@hypit/semantic-track";

import {
  composeTemporalWindow,
  projectMomentInstant,
  projectProgramInstant,
  projectSegmentInstant,
  projectSelectionInstant,
} from "./projection.js";
import { temporalProducers } from "./index.js";
import type { ProjectedInstant, TemporalInstantSpec, TemporalWindowSpec } from "./types.js";

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}

const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

function instantSpec(inputs: ProducerHandlerContext["inputs"]): TemporalInstantSpec {
  return inline<TemporalInstantSpec>(inputs.spec?.value, "TemporalInstantSpec");
}

export const temporalComponent = {
  producers: [
    { producer: temporalProducers.projectProgramInstant, handler: ({ inputs }) => ({ outputs: { instant: output(projectProgramInstant({
      itemId: instantSpec(inputs).id,
      subjectId: instantSpec(inputs).subjectId,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      projection: instantSpec(inputs).projection,
      authority: instantSpec(inputs).authority,
    })) }, needs: {} }) },
    { producer: temporalProducers.projectSelectionInstant, handler: ({ inputs }) => ({ outputs: { instant: output(projectSelectionInstant({
      itemId: instantSpec(inputs).id,
      subjectId: instantSpec(inputs).subjectId,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      selection: inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelection"),
      projection: instantSpec(inputs).projection,
      authority: instantSpec(inputs).authority,
    })) }, needs: {} }) },
    { producer: temporalProducers.projectSegmentInstant, handler: ({ inputs }) => ({ outputs: { instant: output(projectSegmentInstant({
      itemId: instantSpec(inputs).id,
      subjectId: instantSpec(inputs).subjectId,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      segment: inline<NarrativeExcerpt>(inputs.segment?.value, "NarrativeExcerpt"),
      projection: instantSpec(inputs).projection,
      authority: instantSpec(inputs).authority,
    })) }, needs: {} }) },
    { producer: temporalProducers.projectMomentInstant, handler: ({ inputs }) => ({ outputs: { instant: output(projectMomentInstant({
      itemId: instantSpec(inputs).id,
      subjectId: instantSpec(inputs).subjectId,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      moment: inline<NarrativeMomentRef>(inputs.moment?.value, "NarrativeMoment"),
      projection: instantSpec(inputs).projection,
      authority: instantSpec(inputs).authority,
    })) }, needs: {} }) },
    { producer: temporalProducers.composeWindow, handler: ({ inputs }) => ({ outputs: { window: output(composeTemporalWindow(
      inline<TemporalWindowSpec>(inputs.spec?.value, "TemporalWindowSpec"),
      inline<ProjectedInstant>(inputs.start?.value, "TemporalInstant start"),
      inline<ProjectedInstant>(inputs.end?.value, "TemporalInstant end"),
    )) }, needs: {} }) },
  ],
} satisfies ComponentPackage;
