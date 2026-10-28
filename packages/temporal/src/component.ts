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
import { assertTemporalExtent } from "./extent.js";
import { assertExactTemporalValue } from "./exact.js";
import { assertLocalTemporalDomain } from "./domain.js";
import { assertTemporalMap } from "./map.js";
import { temporalProducers, temporalTypes } from "./index.js";
import type { LocalTemporalDomain, TemporalDuration, TemporalExtent, TemporalInstant, TemporalInstantSpec, TemporalShiftSpec, TemporalWindowSpec } from "./types.js";
import { shiftTemporalInstant } from "./projection.js";
import {
  assertTemporalDuration,
  assertTemporalInstant,
  assertTemporalInstantSpec,
  assertTemporalShiftSpec,
  assertTemporalWindow,
  assertTemporalWindowSpec,
} from "./validation.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

const output = (value: unknown) => ((canonicalize(value)));

function instantSpec(inputs: ProducerHandlerContext["inputs"]): TemporalInstantSpec {
  const value = valueOf<TemporalInstantSpec>(inputs.spec?.value, "TemporalInstantSpec");
  assertTemporalInstantSpec(value);
  return value;
}

function instantValue(value: Value | undefined): TemporalInstant {
  const instant = valueOf<TemporalInstant>(value, "TemporalInstant");
  assertTemporalInstant(instant);
  return instant;
}

export const temporalComponent = {
  refinements: [
    { type: temporalTypes.duration, handler: ({ value }) => assertTemporalDuration(value) },
    { type: temporalTypes.exactValue, handler: ({ value }) => assertExactTemporalValue(value as never) },
    { type: temporalTypes.extent, handler: ({ value }) => assertTemporalExtent(value as never) },
    { type: temporalTypes.map, handler: ({ value }) => assertTemporalMap(value as never) },
    { type: temporalTypes.shiftSpec, handler: ({ value }) => assertTemporalShiftSpec(value) },
    { type: temporalTypes.localDomain, handler: ({ value }) => assertLocalTemporalDomain(value as never) },
    { type: temporalTypes.instantSpec, handler: ({ value }) => assertTemporalInstantSpec(value) },
    { type: temporalTypes.instant, handler: ({ value }) => assertTemporalInstant(value) },
    { type: temporalTypes.windowSpec, handler: ({ value }) => assertTemporalWindowSpec(value) },
    { type: temporalTypes.window, handler: ({ value }) => assertTemporalWindow(value) },
  ],
  producers: [
    { producer: temporalProducers.extentFromDomain, handler: ({ inputs }) => ({ kind: "output", value: output(
      temporalExtentFromDomain(valueOf<LocalTemporalDomain>(inputs.domain?.value, "LocalTemporalDomain")),
    ) }) },
    { producer: temporalProducers.extentFromDuration, handler: ({ inputs }) => {
      const duration = valueOf<TemporalDuration>(inputs.duration?.value, "TemporalDuration");
      assertTemporalDuration(duration);
      return { kind: "output", value: output(temporalExtentFromDuration(
        duration, valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      )) };
    } },
    { producer: temporalProducers.projectProgramInstant, handler: ({ inputs }) => ({ kind: "output", value: output(projectProgramInstant({
      itemId: instantSpec(inputs).id,
      subjectId: instantSpec(inputs).subjectId,
      timeline: valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      projection: instantSpec(inputs).projection,
    })) }) },
    { producer: temporalProducers.shiftInstant, handler: ({ inputs }) => ({ kind: "output", value: output(shiftTemporalInstant(
      valueOf<TemporalShiftSpec>(inputs.spec?.value, "TemporalShiftSpec"),
      valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      instantValue(inputs.instant?.value),
      valueOf<TemporalExtent>(inputs.extent?.value, "TemporalExtent"),
    )) }) },
    { producer: temporalProducers.reuseInstant, handler: ({ inputs }) => ({ kind: "output", value: output(
      instantValue(inputs.instant?.value),
    ) }) },
    { producer: temporalProducers.composeWindow, handler: ({ inputs }) => ({ kind: "output", value: output(composeTemporalWindow(
      valueOf<TemporalWindowSpec>(inputs.spec?.value, "TemporalWindowSpec"),
      instantValue(inputs.start?.value),
      instantValue(inputs.end?.value),
    )) }) },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
