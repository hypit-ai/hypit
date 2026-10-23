import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation } from "@hypit/hypit/author";
import { compositionTypes } from "@hypit/composition";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";
import { visualAdjustmentProducers, visualAdjustmentTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createVisualAdjustmentFragment(count: number) {
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error("Visual Adjustment Fragment requires items.");
  const operations: FragmentOperation[] = [{
    id: "set:empty", producer: visualAdjustmentProducers.createSet, inputs: {},
    result: { kind: "output", name: "set" },
  }];
  let current = "set:empty";
  for (let index = 0; index < count; index += 1) {
    const suffix = String(index + 1).padStart(4, "0");
    const id = `set:append:${suffix}`;
    operations.push({
      id, producer: visualAdjustmentProducers.append,
      inputs: { set: operation(current), header: input("header"), timeline: input("timeline"),
        spec: input(`spec-${suffix}`), window: input(`window-${suffix}`) },
      result: { kind: "output", name: "set" },
    });
    current = id;
  }
  operations.push({
    id: "track:finalize", producer: visualAdjustmentProducers.finalize,
    inputs: { set: operation(current), header: input("header"), timeline: input("timeline") },
    result: { kind: "output", name: "track" },
  });
  return sealGraphFragment({
    inputs: [
      { name: "header", type: visualAdjustmentTypes.header },
      { name: "timeline", type: timelineTypes.timeline },
      ...Array.from({ length: count }, (_, index) => {
        const suffix = String(index + 1).padStart(4, "0");
        return [
          { name: `spec-${suffix}`, type: visualAdjustmentTypes.spec },
          { name: `window-${suffix}`, type: temporalTypes.window },
        ];
      }).flat(),
    ],
    operations,
    exports: [{ name: "visual", type: compositionTypes.visualTrack, root: operation("track:finalize") }],
  });
}
