import type { VisualTrack } from "@hypit/composition";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { Timeline } from "@hypit/timeline";

import { visualCombineProducers, visualCombineTypes } from "./manifest.js";
import {
  assertVisualCombineBlock,
  concatVisualCombineBlocks,
  createVisualCombineBlock,
  finalizeVisualCombineBlock,
  sealVisualCombineHeader,
  sealVisualCombineUseSpec,
} from "./program.js";
import type { VisualCombineBlock, VisualCombineHeader, VisualCombineUseSpec } from "./types.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const visualCombineComponent = {
  producers: [
    { producer: visualCombineProducers.createBlock, handler: ({ inputs }) => ({ kind: "output", value: canonicalize(createVisualCombineBlock(
      valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      valueOf<VisualCombineUseSpec>(inputs.spec?.value, "VisualCombineUseSpec"),
      valueOf<VisualTrack>(inputs.track?.value, "VisualTrack"),
    )) }) },
    { producer: visualCombineProducers.concatBlocks, handler: ({ inputs }) => ({ kind: "output", value: canonicalize(concatVisualCombineBlocks(
      valueOf<VisualCombineBlock>(inputs.left?.value, "left VisualCombineBlock"),
      valueOf<VisualCombineBlock>(inputs.right?.value, "right VisualCombineBlock"),
      valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
    )) }) },
    { producer: visualCombineProducers.finalizeBlock, handler: ({ inputs }) => ({ kind: "output", value: canonicalize(finalizeVisualCombineBlock(
      valueOf<VisualCombineBlock>(inputs.block?.value, "VisualCombineBlock"),
      valueOf<VisualCombineHeader>(inputs.header?.value, "VisualCombineHeader"),
      valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
    )) }) },
  ],
  refinements: [
    { type: visualCombineTypes.header, handler: ({ value }) => { sealVisualCombineHeader(valueOf(value, "VisualCombineHeader")); } },
    { type: visualCombineTypes.useSpec, handler: ({ value }) => { sealVisualCombineUseSpec(valueOf(value, "VisualCombineUseSpec")); } },
    { type: visualCombineTypes.block, handler: ({ value }) => assertVisualCombineBlock(valueOf<VisualCombineBlock>(value, "VisualCombineBlock")) },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
