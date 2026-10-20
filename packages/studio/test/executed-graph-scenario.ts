import type { ProducerStep, TypedRecord } from "@hypit/protocol";

import type { ExecutedGraph } from "../src/temporal-graph.js";

export function executedGraph(input: {
  readonly programRecords: readonly TypedRecord[];
  readonly steps: readonly ProducerStep[];
  readonly records: readonly TypedRecord[];
  readonly goals?: readonly string[];
}): ExecutedGraph {
  return {
    program: {
      closure: { format: "hypit.closure@1", modules: [] },
      records: input.programRecords,
    },
    plan: {
      format: "hypit.plan@1",
      steps: input.steps,
      goals: input.goals ?? [],
    },
    records: input.records,
  };
}
