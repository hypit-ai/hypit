import type { ComponentPackage, ProducerHandlerContext } from "@hypit/component-kit";
import { canonicalize } from "@hypit/protocol";
import type { StoredValue } from "@hypit/protocol";
import type { NarrativeExcerpt, NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import type { SemanticTrack } from "@hypit/semantic-track";

import {
  projectMomentPoint,
  projectMomentWindow,
  projectProgramPoint,
  projectProgramWindow,
  projectSegmentPoint,
  projectSegmentWindow,
  projectSelectionPoint,
  projectSelectionWindow,
} from "./projection.js";
import { temporalProducers, temporalTypes } from "./index.js";
import type { TemporalPointSpec, TemporalWindowSpec } from "./types.js";

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}

const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

function windowSpec(inputs: ProducerHandlerContext["inputs"]): TemporalWindowSpec {
  return inline<TemporalWindowSpec>(inputs.spec?.value, "TemporalWindowSpec");
}

function pointSpec(inputs: ProducerHandlerContext["inputs"]): TemporalPointSpec {
  return inline<TemporalPointSpec>(inputs.spec?.value, "TemporalPointSpec");
}

export const temporalComponent = {
  producers: [
    { producer: temporalProducers.projectProgramPoint, handler: ({ inputs }) => ({ outputs: { point: output(projectProgramPoint({
      itemId: pointSpec(inputs).id,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      projection: pointSpec(inputs).projection,
    })) }, needs: {} }) },
    { producer: temporalProducers.projectSelectionPoint, handler: ({ inputs }) => ({ outputs: { point: output(projectSelectionPoint({
      itemId: pointSpec(inputs).id,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      selection: inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelection"),
      projection: pointSpec(inputs).projection,
    })) }, needs: {} }) },
    { producer: temporalProducers.projectSegmentPoint, handler: ({ inputs }) => ({ outputs: { point: output(projectSegmentPoint({
      itemId: pointSpec(inputs).id,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      segment: inline<NarrativeExcerpt>(inputs.segment?.value, "NarrativeExcerpt"),
      projection: pointSpec(inputs).projection,
    })) }, needs: {} }) },
    { producer: temporalProducers.projectMomentPoint, handler: ({ inputs }) => ({ outputs: { point: output(projectMomentPoint({
      itemId: pointSpec(inputs).id,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      moment: inline<NarrativeMomentRef>(inputs.moment?.value, "NarrativeMoment"),
      projection: pointSpec(inputs).projection,
    })) }, needs: {} }) },
    { producer: temporalProducers.projectProgram, handler: ({ inputs }) => ({ outputs: { window: output(projectProgramWindow({
      itemId: windowSpec(inputs).id,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      projection: windowSpec(inputs).projection,
    })) }, needs: {} }) },
    { producer: temporalProducers.projectSelection, handler: ({ inputs }) => ({ outputs: { window: output(projectSelectionWindow({
      itemId: windowSpec(inputs).id,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      selection: inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelection"),
      projection: windowSpec(inputs).projection,
    })) }, needs: {} }) },
    { producer: temporalProducers.projectSegment, handler: ({ inputs }) => ({ outputs: { window: output(projectSegmentWindow({
      itemId: windowSpec(inputs).id,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      segment: inline<NarrativeExcerpt>(inputs.segment?.value, "NarrativeExcerpt"),
      projection: windowSpec(inputs).projection,
    })) }, needs: {} }) },
    { producer: temporalProducers.projectMoment, handler: ({ inputs }) => ({ outputs: { window: output(projectMomentWindow({
      itemId: windowSpec(inputs).id,
      semantic: inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
      moment: inline<NarrativeMomentRef>(inputs.moment?.value, "NarrativeMoment"),
      projection: windowSpec(inputs).projection,
    })) }, needs: {} }) },
  ],
} satisfies ComponentPackage;
