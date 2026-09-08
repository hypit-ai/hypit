import type { ComponentPackage } from "@hypit/component-kit";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, StoredValue } from "@hypit/protocol";
import type { ProgramSpace } from "@hypit/program-space";
import type { CanvasSpace } from "@hypit/spatial";
import type { TemporalInstant, TemporalWindow } from "@hypit/temporal";

import { emojiRevealProducers, emojiRevealTypes } from "./manifest.js";
import { appendEmojiRevealItem, appendPresetEmojiRevealItem, assertEmojiRevealProgram, createEmojiRevealSet, finalizeEmojiReveal, renderEmojiReveal } from "./program.js";
import type { EmojiRevealHeader, EmojiRevealItemSpec, EmojiRevealProgram, EmojiRevealSet, EmojiRevealStyle } from "./types.js";

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}
const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });
function blob(value: StoredValue | undefined, label: string): BlobRef {
  if (value?.kind !== "blob") throw new Error(`${label} must be a blob Artifact.`);
  return value;
}

export const emojiRevealComponent = {
  producers: [
    { producer: emojiRevealProducers.createSet, handler: () => ({ outputs: { set: output(createEmojiRevealSet()) }, needs: {} }) },
    { producer: emojiRevealProducers.appendItem, handler: ({ inputs }) => ({ outputs: { set: output(appendEmojiRevealItem(
      inline<EmojiRevealSet>(inputs.set?.value, "EmojiRevealSet"), inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
      inline<EmojiRevealItemSpec>(inputs.spec?.value, "EmojiRevealItemSpec"), blob(inputs.icon?.value, "Emoji Reveal icon"),
      inline<TemporalInstant>(inputs.activation?.value, "TemporalInstant"),
    )) }, needs: {} }) },
    { producer: emojiRevealProducers.appendPresetItem, handler: ({ inputs }) => ({ outputs: { set: output(appendPresetEmojiRevealItem(
      inline<EmojiRevealSet>(inputs.set?.value, "EmojiRevealSet"),
      inline<EmojiRevealItemSpec>(inputs.spec?.value, "EmojiRevealItemSpec"), blob(inputs.icon?.value, "Emoji Reveal icon"),
    )) }, needs: {} }) },
    { producer: emojiRevealProducers.finalize, handler: ({ inputs }) => ({ outputs: { program: output(finalizeEmojiReveal(
      inline<EmojiRevealHeader>(inputs.header?.value, "EmojiRevealHeader"), inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
      inline<TemporalWindow>(inputs.outer?.value, "TemporalWindow"), inline<EmojiRevealStyle>(inputs.style?.value, "EmojiRevealStyle"),
      blob(inputs.placeholder?.value, "Emoji Reveal placeholder"), inline<EmojiRevealSet>(inputs.set?.value, "EmojiRevealSet"),
    )) }, needs: {} }) },
    { producer: emojiRevealProducers.render, handler: ({ inputs }) => ({ outputs: { track: output(renderEmojiReveal(
      inline<CanvasSpace>(inputs.canvas?.value, "CanvasSpace"), inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
      inline<EmojiRevealProgram>(inputs.program?.value, "EmojiRevealProgram"),
    )) }, needs: {} }) },
  ],
  validators: [{ type: emojiRevealTypes.program, handler: ({ value }) => assertEmojiRevealProgram(inline<EmojiRevealProgram>(value, "EmojiRevealProgram")) }],
} satisfies ComponentPackage;
