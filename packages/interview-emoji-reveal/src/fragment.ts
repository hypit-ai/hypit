import { timelineTypes } from "@hypit/timeline";

import { compositionTypes } from "@hypit/composition";
import { blobTypes } from "@hypit/hypit/blob";
import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation } from "@hypit/hypit/author";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";

import { emojiRevealProducers, emojiRevealTypes } from "./manifest.js";

export type EmojiRevealFragmentItem = {
  readonly specName: string;
  readonly iconName: string;
  readonly activationName?: string;
};
const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createEmojiRevealFragment(items: readonly EmojiRevealFragmentItem[]) {
  if (items.length === 0) throw new Error("Emoji Reveal Fragment requires at least one Item.");
  const operations: FragmentOperation[] = [
    { id: "emoji:set:empty", producer: emojiRevealProducers.createSet, inputs: {}, result: { kind: "output" as const, name: "set" } },
  ];
  let current = "emoji:set:empty";
  items.forEach((item, index) => {
    const id = `emoji:set:append:${String(index + 1).padStart(4, "0")}`;
    operations.push({ id, producer: item.activationName === undefined
      ? emojiRevealProducers.appendPresetItem
      : emojiRevealProducers.appendItem, inputs: {
      set: operation(current), spec: input(item.specName), icon: input(item.iconName),
      ...(item.activationName === undefined ? {} : {
        timeline: input("timeline"), activation: input(item.activationName),
      }),
    }, result: { kind: "output" as const, name: "set" } });
    current = id;
  });
  operations.push(
    { id: "emoji:program", producer: emojiRevealProducers.finalize, inputs: {
      header: input("header"), timeline: input("timeline"), outer: input("outer"), style: input("style"),
      placeholder: input("placeholder"), set: operation(current),
    }, result: { kind: "output" as const, name: "program" } },
    { id: "emoji:track", producer: emojiRevealProducers.render, inputs: {
      within: input("within"), timeline: input("timeline"), program: operation("emoji:program"),
    }, result: { kind: "output" as const, name: "track" } },
  );
  return sealGraphFragment({
    inputs: [
      { name: "header", type: emojiRevealTypes.header }, { name: "timeline", type: timelineTypes.timeline },
      { name: "within", type: spatialTypes.frame }, { name: "outer", type: temporalTypes.window }, { name: "style", type: emojiRevealTypes.style },
      { name: "placeholder", type: blobTypes.blob },
      ...items.flatMap((item) => [
        { name: item.specName, type: emojiRevealTypes.itemSpec }, { name: item.iconName, type: blobTypes.blob },
        ...(item.activationName === undefined ? [] : [{ name: item.activationName, type: temporalTypes.instant }]),
      ]),
    ],
    operations,
    exports: [
      { name: "program", type: emojiRevealTypes.program, root: operation("emoji:program") },
      { name: "visual", type: compositionTypes.visualTrack, root: operation("emoji:track") },
    ],
  });
}
