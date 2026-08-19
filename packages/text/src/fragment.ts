import { sealGraphFragment } from "@hypit/elaborator";

import { textProducers, textTypes } from "./manifest.js";

export type TextFragmentBinding = {
  readonly name: string;
};

/**
 * A reusable graph shape for Template + initial Bindings + explicit Text edges.
 * The caller supplies one authored TextBinding record and one Text value for
 * every entry; no binding is discovered through metadata.
 */
export function createTextRenderFragment(entries: readonly TextFragmentBinding[] = []) {
  const names = entries.map((entry) => entry.name);
  if (new Set(names).size !== names.length) throw new Error("Text Fragment binding names must be unique");
  const input = (name: string) => ({ kind: "fragment-input" as const, name });
  const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });
  const inputs = [
    { name: "template", type: textTypes.template },
    { name: "bindings", type: textTypes.bindings },
  ];
  const operations: Array<import("@hypit/elaborator").FragmentOperation> = [];
  let bindings = input("bindings") as ReturnType<typeof input> | ReturnType<typeof operation>;
  entries.forEach((entry, index) => {
    const prefix = `binding:${entry.name}`;
    inputs.push({ name: `${prefix}:spec`, type: textTypes.binding });
    inputs.push({ name: `${prefix}:text`, type: textTypes.text });
    const id = `bind:${String(index + 1).padStart(4, "0")}:${entry.name}`;
    operations.push({
      id,
      producer: textProducers.bindText,
      inputs: {
        bindings,
        binding: input(`${prefix}:spec`),
        text: input(`${prefix}:text`),
      },
      result: { kind: "output", name: "bindings" },
    });
    bindings = operation(id);
  });
  operations.push({
    id: "render",
    producer: textProducers.render,
    inputs: { template: input("template"), bindings },
    result: { kind: "output", name: "text" },
  });
  return sealGraphFragment({
    inputs,
    operations,
    exports: [{
      name: "text",
      type: textTypes.text,
      root: operation("render"),
    }],
  });
}
