import type { ComponentPackage, ProducerHandlerContext } from "@hypit/component-kit";
import { canonicalize } from "@hypit/protocol";
import type { StoredValue } from "@hypit/protocol";
import type { NarrativeExcerpt, NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import type { SemanticTrack } from "@hypit/semantic-track";

import {
  projectMomentWindow,
  projectProgramWindow,
  projectSegmentWindow,
  projectSelectionWindow,
} from "./projection.js";
import { temporalProducers, temporalTypes } from "./index.js";
import type { TemporalWindowSpec } from "./types.js";

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}

const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

function spec(inputs: ProducerHandlerContext["inputs"]): TemporalWindowSpec {
  return inline<TemporalWindowSpec>(inputs.spec?.value, "TemporalWindowSpec");
}

export const temporalComponent = {
  producers: [
    { producer: temporalProducers.projectProgram, handler: ({ inputs }) => ({ outputs: { window: output(projectProgramWindow({
      itemId: spec(inputs).id,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      projection: spec(inputs).projection,
    })) }, needs: {} }) },
    { producer: temporalProducers.projectSelection, handler: ({ inputs }) => ({ outputs: { window: output(projectSelectionWindow({
      itemId: spec(inputs).id,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      selection: inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelection"),
      projection: spec(inputs).projection,
    })) }, needs: {} }) },
    { producer: temporalProducers.projectSegment, handler: ({ inputs }) => ({ outputs: { window: output(projectSegmentWindow({
      itemId: spec(inputs).id,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      segment: inline<NarrativeExcerpt>(inputs.segment?.value, "NarrativeExcerpt"),
      projection: spec(inputs).projection,
    })) }, needs: {} }) },
    { producer: temporalProducers.projectMoment, handler: ({ inputs }) => ({ outputs: { window: output(projectMomentWindow({
      itemId: spec(inputs).id,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      moment: inline<NarrativeMomentRef>(inputs.moment?.value, "NarrativeMoment"),
      projection: spec(inputs).projection,
    })) }, needs: {} }) },
  ],
} satisfies ComponentPackage;
