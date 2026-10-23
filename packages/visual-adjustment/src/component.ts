import { assertVisualTrackIdentity } from "@hypit/composition";
import type { Value } from "@hypit/hypit/protocol";
import { canonicalize } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { TemporalWindow } from "@hypit/temporal";
import type { Timeline } from "@hypit/timeline";
import { visualAdjustmentProducers, visualAdjustmentTypes } from "./manifest.js";
import { appendVisualAdjustment, assertVisualAdjustmentSet, assertVisualAdjustmentSpec, createVisualAdjustmentSet, finalizeVisualAdjustmentTrack, sealVisualAdjustmentHeader } from "./program.js";
import type { VisualAdjustmentHeader, VisualAdjustmentSet, VisualAdjustmentSpec } from "./types.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const visualAdjustmentComponent = {
  producers: [
    { producer: visualAdjustmentProducers.createSet,
      handler: () => ({ kind: "output", value: canonicalize(createVisualAdjustmentSet()) }) },
    { producer: visualAdjustmentProducers.append, handler: ({ inputs }) => ({ kind: "output", value: canonicalize(
      appendVisualAdjustment(
        valueOf<VisualAdjustmentSet>(inputs.set?.value, "VisualAdjustmentSet"),
        valueOf<VisualAdjustmentHeader>(inputs.header?.value, "VisualAdjustmentHeader"),
        valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        valueOf<VisualAdjustmentSpec>(inputs.spec?.value, "VisualAdjustmentSpec"),
        valueOf<TemporalWindow>(inputs.window?.value, "TemporalWindow"),
      ),
    ) }) },
    { producer: visualAdjustmentProducers.finalize, handler: ({ inputs }) => {
      const track = finalizeVisualAdjustmentTrack(
        valueOf<VisualAdjustmentSet>(inputs.set?.value, "VisualAdjustmentSet"),
        valueOf<VisualAdjustmentHeader>(inputs.header?.value, "VisualAdjustmentHeader"),
        valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      );
      assertVisualTrackIdentity(track);
      return { kind: "output", value: canonicalize(track) };
    } },
  ],
  refinements: [
    { type: visualAdjustmentTypes.header, handler: ({ value }) => { sealVisualAdjustmentHeader(valueOf(value, "VisualAdjustmentHeader")); } },
    { type: visualAdjustmentTypes.spec, handler: ({ value }) => { assertVisualAdjustmentSpec(valueOf(value, "VisualAdjustmentSpec")); } },
    { type: visualAdjustmentTypes.set, handler: ({ value }) => { assertVisualAdjustmentSet(valueOf(value, "VisualAdjustmentSet")); } },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
