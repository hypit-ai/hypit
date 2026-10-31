import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation } from "@hypit/hypit/author";
import { compositionTypes } from "@hypit/composition";
import { timelineTypes } from "@hypit/timeline";
import { visualCombineProducers, visualCombineTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createVisualCombineFragment(count: number) {
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error("Visual Combine Fragment requires Uses.");
  const operations: FragmentOperation[] = [];
  let current: { readonly id: string; readonly first: number; readonly last: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const suffix = String(index + 1).padStart(4, "0");
    const id = `block:use:${suffix}`;
    operations.push({
      id,
      producer: visualCombineProducers.createBlock,
      inputs: {
        timeline: input("timeline"),
        spec: input(`spec-${suffix}`),
        track: input(`track-${suffix}`),
      },
      result: { kind: "output", name: "block" },
    });
    current.push({ id, first: index + 1, last: index + 1 });
  }

  // Fixed Producer ports remain a Core invariant. A balanced pure reduction avoids the
  // quadratic prefix-copying of the former append Set without adding variadic ports.
  while (current.length > 1) {
    const next: typeof current = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index] as (typeof current)[number];
      const right = current[index + 1];
      if (right === undefined) {
        next.push(left);
        continue;
      }
      const id = `block:concat:${String(left.first).padStart(4, "0")}-${String(right.last).padStart(4, "0")}`;
      operations.push({
        id,
        producer: visualCombineProducers.concatBlocks,
        inputs: { left: operation(left.id), right: operation(right.id), timeline: input("timeline") },
        result: { kind: "output", name: "block" },
      });
      next.push({ id, first: left.first, last: right.last });
    }
    current = next;
  }
  const root = current[0];
  if (root === undefined) throw new Error("Visual Combine Fragment requires Uses.");
  operations.push({
    id: "combine:finalize",
    producer: visualCombineProducers.finalizeBlock,
    inputs: { block: operation(root.id), header: input("header"), timeline: input("timeline") },
    result: { kind: "output", name: "track" },
  });
  return sealGraphFragment({
    inputs: [
      { name: "header", type: visualCombineTypes.header },
      { name: "timeline", type: timelineTypes.timeline },
      ...Array.from({ length: count }, (_, index) => {
        const suffix = String(index + 1).padStart(4, "0");
        return [
          { name: `spec-${suffix}`, type: visualCombineTypes.useSpec },
          { name: `track-${suffix}`, type: compositionTypes.visualTrack },
        ];
      }).flat(),
    ],
    operations,
    exports: [{ name: "visual", type: compositionTypes.visualTrack, root: operation("combine:finalize") }],
  });
}
