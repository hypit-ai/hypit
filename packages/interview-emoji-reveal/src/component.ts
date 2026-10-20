import type { Timeline } from "@hypit/timeline";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import { assertBlobRef, canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, Value } from "@hypit/hypit/protocol";
import type { SpatialFrame } from "@hypit/spatial";
import type { TemporalInstant, TemporalWindow } from "@hypit/temporal";

import { emojiRevealProducers, emojiRevealTypes } from "./manifest.js";
import { appendEmojiRevealItem, appendPresetEmojiRevealItem, assertEmojiRevealProgram, createEmojiRevealSet, finalizeEmojiReveal, renderEmojiReveal } from "./program.js";
import type { EmojiRevealHeader, EmojiRevealItemSpec, EmojiRevealProgram, EmojiRevealSet, EmojiRevealStyle } from "./types.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}
const output = (value: unknown) => ((canonicalize(value)));
function blob(value: Value | undefined, label: string): BlobRef {
  assertBlobRef(value, label);
  return value;
}

export const emojiRevealComponent = {
  producers: [
    { producer: emojiRevealProducers.createSet, handler: () => ({ kind: "output", value: output(createEmojiRevealSet()) }) },
    { producer: emojiRevealProducers.appendItem, handler: ({ inputs }) => ({ kind: "output", value: output(appendEmojiRevealItem(
      valueOf<EmojiRevealSet>(inputs.set?.value, "EmojiRevealSet"), valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      valueOf<EmojiRevealItemSpec>(inputs.spec?.value, "EmojiRevealItemSpec"), blob(inputs.icon?.value, "Emoji Reveal icon"),
      valueOf<TemporalInstant>(inputs.activation?.value, "TemporalInstant"),
    )) }) },
    { producer: emojiRevealProducers.appendPresetItem, handler: ({ inputs }) => ({ kind: "output", value: output(appendPresetEmojiRevealItem(
      valueOf<EmojiRevealSet>(inputs.set?.value, "EmojiRevealSet"),
      valueOf<EmojiRevealItemSpec>(inputs.spec?.value, "EmojiRevealItemSpec"), blob(inputs.icon?.value, "Emoji Reveal icon"),
    )) }) },
    { producer: emojiRevealProducers.finalize, handler: ({ inputs }) => ({ kind: "output", value: output(finalizeEmojiReveal(
      valueOf<EmojiRevealHeader>(inputs.header?.value, "EmojiRevealHeader"), valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      valueOf<TemporalWindow>(inputs.outer?.value, "TemporalWindow"), valueOf<EmojiRevealStyle>(inputs.style?.value, "EmojiRevealStyle"),
      blob(inputs.placeholder?.value, "Emoji Reveal placeholder"), valueOf<EmojiRevealSet>(inputs.set?.value, "EmojiRevealSet"),
    )) }) },
    { producer: emojiRevealProducers.render, handler: ({ inputs }) => ({ kind: "output", value: output(renderEmojiReveal(
      valueOf<SpatialFrame>(inputs.within?.value, "SpatialFrame"), valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      valueOf<EmojiRevealProgram>(inputs.program?.value, "EmojiRevealProgram"),
    )) }) },
  ],
  refinements: [{ type: emojiRevealTypes.program, handler: ({ value }) => assertEmojiRevealProgram(valueOf<EmojiRevealProgram>(value, "EmojiRevealProgram")) }],
} satisfies ProducerPackage & RefinementPackage;
