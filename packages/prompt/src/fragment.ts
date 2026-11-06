import { sealGraphFragment } from "@hypit/author";
import type { GraphFragment } from "@hypit/author";
import { textTypes } from "@hypit/text";

import { promptProducers, promptTypes } from "./manifest.js";

export function createPromptRenderFragment(slots: readonly string[] = []) {
  if (new Set(slots).size !== slots.length) throw new Error("Prompt Fragment slot names must be unique");
  const input = (name: string) => ({ kind: "fragment-input" as const, name });
  const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });
  const inputs: Array<GraphFragment["inputs"][number]> = [
    { name: "template", type: promptTypes.template },
    { name: "bindings", type: promptTypes.bindings },
  ];
  const operations: import("@hypit/author").FragmentOperation[] = [];
  let bindings = input("bindings") as ReturnType<typeof input> | ReturnType<typeof operation>;
  slots.forEach((slot, index) => {
    const prefix = `slot:${slot}`;
    inputs.push({ name: `${prefix}:binding`, type: promptTypes.slotBinding });
    inputs.push({ name: `${prefix}:text`, type: textTypes.text });
    const id = `bind-slot:${String(index + 1).padStart(4, "0")}:${slot}`;
    operations.push({
      id,
      producer: promptProducers.bindSlot,
      inputs: {
        bindings,
        binding: input(`${prefix}:binding`),
        text: input(`${prefix}:text`),
      },
      result: { kind: "output", name: "bindings" },
    });
    bindings = operation(id);
  });
  operations.push({
    id: "render",
    producer: promptProducers.render,
    inputs: { template: input("template"), bindings },
    result: { kind: "output", name: "prompt" },
  });
  return sealGraphFragment({
    inputs,
    operations,
    exports: [{ name: "prompt", type: promptTypes.prompt, root: operation("render") }],
  });
}
