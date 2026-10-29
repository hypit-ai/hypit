import type { Composition } from "@hypit/composition";
import type { WorkingPictureSpec } from "@hypit/media";
import type { Timeline } from "@hypit/timeline";
import type { TemporalWindow } from "@hypit/temporal";
import type { Value } from "@hypit/hypit/protocol";
import { canonicalize } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import { compositionClipProducers, compositionClipTypes } from "./manifest.js";
import { assertCompositionOccurrence, createCompositionOccurrence, renderCompositionAudio, renderCompositionVisual } from "./program.js";
import type { CompositionAudioUse, CompositionOccurrence, CompositionOccurrenceSpec, CompositionVisualUse, CompositionVisualUseSpec } from "./types.js";

function value<T>(input: Value | undefined, label: string): T {
  if (input === undefined) throw new Error(`${label} is missing.`);
  return input as unknown as T;
}

export const compositionClipComponent = {
  producers: [
    { producer: compositionClipProducers.createOccurrence, handler: ({ inputs }) => ({ kind: "output", value: canonicalize(createCompositionOccurrence(
      value<Timeline>(inputs.timeline?.value, "Timeline"), value<Composition>(inputs.source?.value, "Composition"),
      value<TemporalWindow>(inputs.window?.value, "TemporalWindow"), value<CompositionOccurrenceSpec>(inputs.spec?.value, "CompositionOccurrenceSpec"),
    )) }) },
    { producer: compositionClipProducers.bindVisualUse, handler: ({ inputs }) => ({ kind: "output", value: canonicalize({
      ...value<CompositionVisualUseSpec>(inputs.spec?.value, "CompositionVisualUseSpec"),
      frame: value<CompositionVisualUse["frame"]>(inputs.frame?.value, "SpatialFrame"),
    }) }) },
    { producer: compositionClipProducers.renderVisual, handler: ({ inputs }) => ({ kind: "output", value: canonicalize(renderCompositionVisual(
      value<Timeline>(inputs.timeline?.value, "Timeline"), value<WorkingPictureSpec>(inputs.picture?.value, "WorkingPictureSpec"),
      value<CompositionOccurrence>(inputs.occurrence?.value, "CompositionOccurrence"), value<CompositionVisualUse>(inputs.use?.value, "CompositionVisualUse"),
    )) }) },
    { producer: compositionClipProducers.renderAudio, handler: ({ inputs }) => ({ kind: "output", value: canonicalize(renderCompositionAudio(
      value<Timeline>(inputs.timeline?.value, "Timeline"), value<CompositionOccurrence>(inputs.occurrence?.value, "CompositionOccurrence"),
      value<CompositionAudioUse>(inputs.use?.value, "CompositionAudioUse"),
    )) }) },
  ],
  refinements: [{ type: compositionClipTypes.occurrence, handler: ({ value: item }) => assertCompositionOccurrence(item as unknown as CompositionOccurrence) }],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
