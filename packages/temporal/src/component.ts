import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage, ProducerHandlerContext } from "@hypit/hypit/producer";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { Timeline } from "@hypit/timeline";

import {
  composeTemporalWindow,
  projectProgramInstant,
} from "./projection.js";
import { temporalExtentFromDomain, temporalExtentFromDuration } from "./extent.js";
import { temporalProducers } from "./index.js";
import type { LocalTemporalDomain, TemporalDuration, TemporalExtent, TemporalInstant, TemporalInstantSpec, TemporalShiftSpec, TemporalWindowSpec } from "./types.js";
import { shiftTemporalInstant } from "./projection.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

const output = (value: unknown) => ((canonicalize(value)));

function instantSpec(inputs: ProducerHandlerContext["inputs"]): TemporalInstantSpec {
  return valueOf<TemporalInstantSpec>(inputs.spec?.value, "TemporalInstantSpec");
}

export const temporalComponent = {
  producers: [
    { producer: temporalProducers.extentFromDomain, handler: ({ inputs }) => ({ kind: "output", value: output(
      temporalExtentFromDomain(valueOf<LocalTemporalDomain>(inputs.domain?.value, "LocalTemporalDomain")),
    ) }) },
    { producer: temporalProducers.extentFromDuration, handler: ({ inputs }) => ({ kind: "output", value: output(
      temporalExtentFromDuration(valueOf<TemporalDuration>(inputs.duration?.value, "TemporalDuration"),
        valueOf<Timeline>(inputs.timeline?.value, "Timeline")),
    ) }) },
    { producer: temporalProducers.projectProgramInstant, handler: ({ inputs }) => ({ kind: "output", value: output(projectProgramInstant({
      itemId: instantSpec(inputs).id,
      subjectId: instantSpec(inputs).subjectId,
      timeline: valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      projection: instantSpec(inputs).projection,
    })) }) },
    { producer: temporalProducers.shiftInstant, handler: ({ inputs }) => ({ kind: "output", value: output(shiftTemporalInstant(
      valueOf<TemporalShiftSpec>(inputs.spec?.value, "TemporalShiftSpec"),
      valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      valueOf<TemporalInstant>(inputs.instant?.value, "TemporalInstant"),
      valueOf<TemporalExtent>(inputs.extent?.value, "TemporalExtent"),
    )) }) },
    { producer: temporalProducers.reuseInstant, handler: ({ inputs }) => ({ kind: "output", value: output(
      valueOf<TemporalInstant>(inputs.instant?.value, "TemporalInstant"),
    ) }) },
    { producer: temporalProducers.composeWindow, handler: ({ inputs }) => ({ kind: "output", value: output(composeTemporalWindow(
      valueOf<TemporalWindowSpec>(inputs.spec?.value, "TemporalWindowSpec"),
      valueOf<TemporalInstant>(inputs.start?.value, "TemporalInstant start"),
      valueOf<TemporalInstant>(inputs.end?.value, "TemporalInstant end"),
    )) }) },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
