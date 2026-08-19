import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation, GraphFragment } from "@hypit/elaborator";
import { narrativeTypes } from "@hypit/narrative";
import { programSpaceTypes } from "@hypit/program-space";
import { semanticMapTypes } from "@hypit/semantic-map";
import { spatialTypes } from "@hypit/spatial";
import { textTypes } from "@hypit/text";

import { linerankProducers, linerankTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export type LinerankFragmentItem = {
  readonly suffix: string;
  readonly specName: string;
  readonly contentName?: string;
};

export function createLinerankFragment(items: readonly LinerankFragmentItem[]) {
  if (items.length === 0) throw new Error("Linerank Fragment requires at least one Item.");
  const inputs: Array<GraphFragment["inputs"][number]> = [
    { name: "header", type: linerankTypes.header },
    { name: "map", type: semanticMapTypes.complete },
    { name: "space", type: programSpaceTypes.programSpace },
    { name: "outer", type: narrativeTypes.selection },
    { name: "triggers", type: narrativeTypes.moment },
    { name: "terminal", type: narrativeTypes.moment },
    { name: "frame", type: spatialTypes.frame },
    { name: "style", type: linerankTypes.style },
    { name: "title", type: textTypes.text },
  ];
  const operations: FragmentOperation[] = [
    { id: "specs", producer: linerankProducers.createSpecs, inputs: {}, result: { kind: "output", name: "set" } },
    { id: "resolved", producer: linerankProducers.createItems, inputs: {}, result: { kind: "output", name: "set" } },
  ];
  let specs = operation("specs");
  let resolved = operation("resolved");
  for (const item of items) {
    inputs.push({ name: item.specName, type: item.contentName === undefined ? linerankTypes.itemSpec : linerankTypes.textItemShell });
    if (item.contentName !== undefined) inputs.push({ name: item.contentName, type: textTypes.text });
    const resolvedSpec = item.contentName === undefined ? input(item.specName) : (() => {
      const id = `materialize-${item.suffix}`;
      operations.push({
        id,
        producer: linerankProducers.materializeTextItem,
        inputs: { shell: input(item.specName), content: input(item.contentName!) },
        result: { kind: "output", name: "spec" },
      });
      return operation(id);
    })();
    const semanticId = `spec-${item.suffix}`;
    operations.push({
      id: semanticId,
      producer: linerankProducers.appendSpec,
      inputs: { set: specs, spec: resolvedSpec },
      result: { kind: "output", name: "set" },
    });
    specs = operation(semanticId);
    const visualId = `item-${item.suffix}`;
    operations.push({
      id: visualId,
      producer: linerankProducers.appendItem,
      inputs: { set: resolved, spec: resolvedSpec },
      result: { kind: "output", name: "set" },
    });
    resolved = operation(visualId);
  }
  operations.push({
    id: "schedule",
    producer: linerankProducers.schedule,
    inputs: {
      header: input("header"), items: specs, map: input("map"), space: input("space"),
      outer: input("outer"), triggers: input("triggers"), terminal: input("terminal"),
    },
    result: { kind: "output", name: "schedule" },
  });
  operations.push({
    id: "program",
    producer: linerankProducers.program,
    inputs: {
      header: input("header"), frame: input("frame"), schedule: operation("schedule"),
      style: input("style"), title: input("title"), set: resolved,
    },
    result: { kind: "output", name: "program" },
  });
  operations.push({
    id: "visual",
    producer: linerankProducers.render,
    inputs: { space: input("space"), program: operation("program") },
    result: { kind: "output", name: "track" },
  });
  return sealGraphFragment({
    inputs,
    operations,
    exports: [
      { name: "schedule", type: linerankTypes.schedule, root: operation("schedule") },
      { name: "program", type: linerankTypes.program, root: operation("program") },
      { name: "visual", type: compositionTypes.visualTrack, root: operation("visual") },
    ],
  });
}
