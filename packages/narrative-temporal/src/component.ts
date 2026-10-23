import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { Narrative, NarrativeSegmentRef, NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { canonicalize } from "@hypit/hypit/protocol";
import type { ProducerRef, Value } from "@hypit/hypit/protocol";
import type { LocalTemporalDomain, TemporalWindow } from "@hypit/temporal";
import type { Timeline } from "@hypit/timeline";

import { assertNarrativeAlignmentIdentity } from "./identity.js";
import { materializeSegmentBoundaryAlignment } from "./materialize.js";
import { narrativeTemporalProducers, narrativeTemporalTypes } from "./manifest.js";
import { createNarrativeProjection, projectNarrativeAlignment, projectNarrativeInstant } from "./projection.js";
import type { NarrativeAlignment, NarrativeInstantSpec, NarrativeProjection, NarrativeProjectionHeader, NarrativeProjectionParts } from "./types.js";

function valueOf<T>(value: Value | undefined, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value as T;
}

export const narrativeTemporalComponent = {
  refinements: [{ type: narrativeTemporalTypes.narrativeAlignment,
    handler: ({ value }) => assertNarrativeAlignmentIdentity(valueOf<NarrativeAlignment>(value, "NarrativeAlignment")) }],
  producers: [{
    producer: narrativeTemporalProducers.materializeSegmentBoundaries,
    handler: ({ inputs }) => ({ kind: "output", value: (canonicalize(materializeSegmentBoundaryAlignment(
      valueOf<Narrative>(inputs.narrative?.value, "Narrative"),
      valueOf<NarrativeSegmentRef>(inputs.segment?.value, "NarrativeSegmentRef"),
      valueOf<LocalTemporalDomain>(inputs.domain?.value, "LocalTemporalDomain"),
    ))) }),
  }, {
    producer: narrativeTemporalProducers.projectAlignment,
    handler: ({ inputs }) => ({ kind: "output", value: (canonicalize({ parts: [
      projectNarrativeAlignment(
        valueOf<NarrativeAlignment>(inputs.alignment?.value, "NarrativeAlignment"),
        valueOf<LocalTemporalDomain>(inputs.domain?.value, "LocalTemporalDomain"),
        valueOf<TemporalWindow>(inputs.window?.value, "TemporalWindow"),
        valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      ),
    ] })) }),
  }, {
    producer: narrativeTemporalProducers.combineProjectionParts,
    handler: ({ inputs }) => {
      const left = valueOf<NarrativeProjectionParts>(inputs.left?.value, "NarrativeProjectionParts");
      const right = valueOf<NarrativeProjectionParts>(inputs.right?.value, "NarrativeProjectionParts");
      return { kind: "output", value: (canonicalize({ parts: [...left.parts, ...right.parts] })) };
    },
  }, {
    producer: narrativeTemporalProducers.finalizeProjection,
    handler: ({ inputs }) => {
      const header = valueOf<NarrativeProjectionHeader>(inputs.header?.value, "NarrativeProjectionHeader");
      const narrative = valueOf<Narrative>(inputs.narrative?.value, "Narrative");
      const timeline = valueOf<Timeline>(inputs.timeline?.value, "Timeline");
      const parts = valueOf<NarrativeProjectionParts>(inputs.parts?.value, "NarrativeProjectionParts");
      return { kind: "output", value: (canonicalize(
        createNarrativeProjection(header.id, narrative.id, timeline, parts.parts),
      )) };
    },
  }, ...([
    projectionFacet(narrativeTemporalProducers.projectSelectionInstant, "selection", "selection"),
    projectionFacet(narrativeTemporalProducers.projectSegmentInstant, "segment", "segment"),
    projectionFacet(narrativeTemporalProducers.projectMomentInstant, "moment", "moment"),
  ])],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };

function projectionFacet(producer: ProducerRef, inputName: "selection" | "segment" | "moment",
  sourceKind: "selection" | "segment" | "moment"): ProducerPackage[number] {
  return { producer, handler: ({ inputs }) => {
    const spec = valueOf<NarrativeInstantSpec>(inputs.spec?.value, "NarrativeInstantSpec");
    return { kind: "output", value: (canonicalize(projectNarrativeInstant({
      narrative: valueOf<NarrativeProjection>(inputs.projection?.value, "NarrativeProjection"),
      source: valueOf<NarrativeSelectionRef | NarrativeSegmentRef | NarrativeMomentRef>(inputs[inputName]?.value, inputName),
      sourceKind, spec,
    }))) };
  } };
}
