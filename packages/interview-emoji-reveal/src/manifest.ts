import { timelineTypes, timelineDependency } from "@hypit/timeline";

import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import { compositionDependency, compositionTypes } from "@hypit/composition";

import { blobRefSchema } from "@hypit/hypit/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { spatialDependency, spatialTypes } from "@hypit/spatial";
import { temporalDependency, temporalInstantSchema, temporalTypes, temporalWindowSchema } from "@hypit/temporal";

export const emojiRevealModuleRef = { name: "@hypit/interview-emoji-reveal", version: "1" } as const;

export const emojiRevealTypes = {
  header: { module: emojiRevealModuleRef, name: "EmojiRevealHeader" },
  style: { module: emojiRevealModuleRef, name: "EmojiRevealStyle" },
  itemSpec: { module: emojiRevealModuleRef, name: "EmojiRevealItemSpec" },
  set: { module: emojiRevealModuleRef, name: "EmojiRevealSet" },
  program: { module: emojiRevealModuleRef, name: "EmojiRevealProgram" },
} satisfies Record<string, TypeRef>;

export const emojiRevealProducers = {
  createSet: { module: emojiRevealModuleRef, name: "create-emoji-reveal-set" },
  appendItem: { module: emojiRevealModuleRef, name: "append-emoji-reveal-item" },
  appendPresetItem: { module: emojiRevealModuleRef, name: "append-preset-emoji-reveal-item" },
  finalize: { module: emojiRevealModuleRef, name: "finalize-emoji-reveal" },
  render: { module: emojiRevealModuleRef, name: "render-emoji-reveal" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const positive = { kind: "number", minimum: 0.000001 } as const;
const nonNegative = { kind: "number", minimum: 0 } as const;
const number = { kind: "number" } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const blob = blobRefSchema();

export const emojiRevealHeaderSchema: ValueSchema = object({ id: { schema: string } });
export const emojiRevealItemSpecSchema: ValueSchema = object({
  id: { schema: string }, preset: { schema: { kind: "boolean" } },
});
export const emojiRevealStyleSchema: ValueSchema = object({
  id: { schema: string },
  centerX: { schema: number }, topY: { schema: number },
  slotSizePx: { schema: positive }, gapPx: { schema: nonNegative },
  paddingXPx: { schema: nonNegative }, paddingYPx: { schema: nonNegative },
  background: { schema: string }, borderColor: { schema: string }, borderWidthPx: { schema: nonNegative }, radiusPx: { schema: nonNegative },
  shadowColor: { schema: string }, shadowXPx: { schema: number }, shadowYPx: { schema: number }, shadowBlurPx: { schema: nonNegative }, shadowSpreadPx: { schema: number },
  iconSizePx: { schema: positive }, revealFrames: { schema: positiveInteger },
});
const emojiRevealItemSchema: ValueSchema = object({
  spec: { schema: emojiRevealItemSpecSchema }, icon: { schema: blob }, activation: { schema: temporalInstantSchema, optional: true },
});
export const emojiRevealSetSchema: ValueSchema = object({
  items: { schema: { kind: "array", items: emojiRevealItemSchema } },
});
export const emojiRevealProgramSchema: ValueSchema = object({
  id: { schema: string }, timelineId: { schema: string }, outer: { schema: temporalWindowSchema },
  style: { schema: emojiRevealStyleSchema }, placeholder: { schema: blob },
  items: { schema: { kind: "array", minItems: 1, items: emojiRevealItemSchema } },
});

export const emojiRevealManifest: ModuleManifest = {
  format: "hypit.module@1", name: emojiRevealModuleRef.name, version: emojiRevealModuleRef.version,
  dependencies: [blobDependency, timelineDependency, spatialDependency, temporalDependency, compositionDependency],
  types: [
    emojiRevealTypes.header.name, emojiRevealTypes.style.name,
    emojiRevealTypes.itemSpec.name, emojiRevealTypes.set.name, emojiRevealTypes.program.name,
  ],
  capabilities: [],
  producers: [
    { name: emojiRevealProducers.createSet.name, inputs: [], result: { kind: "output" as const, name: "set", type: emojiRevealTypes.set } },
    { name: emojiRevealProducers.appendItem.name,
      inputs: [{ name: "set", type: emojiRevealTypes.set }, { name: "timeline", type: timelineTypes.timeline }, { name: "spec", type: emojiRevealTypes.itemSpec }, { name: "icon", type: blobTypes.blob }, { name: "activation", type: temporalTypes.instant }],
      result: { kind: "output" as const, name: "set", type: emojiRevealTypes.set } },
    { name: emojiRevealProducers.appendPresetItem.name,
      inputs: [{ name: "set", type: emojiRevealTypes.set }, { name: "spec", type: emojiRevealTypes.itemSpec }, { name: "icon", type: blobTypes.blob }],
      result: { kind: "output" as const, name: "set", type: emojiRevealTypes.set } },
    { name: emojiRevealProducers.finalize.name,
      inputs: [{ name: "header", type: emojiRevealTypes.header }, { name: "timeline", type: timelineTypes.timeline }, { name: "outer", type: temporalTypes.window }, { name: "style", type: emojiRevealTypes.style }, { name: "placeholder", type: blobTypes.blob }, { name: "set", type: emojiRevealTypes.set }],
      result: { kind: "output" as const, name: "program", type: emojiRevealTypes.program } },
    { name: emojiRevealProducers.render.name,
      inputs: [{ name: "within", type: spatialTypes.frame }, { name: "timeline", type: timelineTypes.timeline }, { name: "program", type: emojiRevealTypes.program }],
      result: { kind: "output" as const, name: "track", type: compositionTypes.visualTrack } },
  ],
};

export const emojiRevealDependency = emojiRevealModuleRef;
