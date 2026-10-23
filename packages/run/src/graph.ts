import type { RunGraph } from "./types.js";
import { compareCodeUnits, normalizeValue } from "@hypit/protocol";

export class RunGraphError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RunGraphError";
    this.code = code;
  }
}

function assert(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new RunGraphError(code, message);
}

function content(graph: RunGraph): RunGraph {
  return {
    format: "hypit.run-graph@1",
    records: graph.records.map((record) => ({ ...record, value: normalizeValue(record.value) }))
      .sort((left, right) => compareCodeUnits(left.id, right.id)),
    candidates: [...graph.candidates].sort((left, right) => compareCodeUnits(left.id, right.id)),
    operations: [...graph.operations].sort((left, right) => compareCodeUnits(left.id, right.id)),
    satisfactions: [...graph.satisfactions].sort((left, right) => compareCodeUnits(left.output, right.output)),
    targets: [...graph.targets].sort(),
  };
}

export function sealRunGraph(input: Omit<RunGraph, "format">): RunGraph {
  const graph = content({ format: "hypit.run-graph@1", ...input });
  verifyRunGraph(graph);
  return graph;
}

export function verifyRunGraph(graph: RunGraph): void {
  assert(graph.format === "hypit.run-graph@1", "UNSUPPORTED_RUN_GRAPH", "unsupported Run Graph");
  const recordIds = new Set<string>();
  for (const record of graph.records) {
    assert(record.id.length > 0, "EMPTY_RUN_RECORD", "Run Graph Record id is empty");
    assert(!recordIds.has(record.id), "DUPLICATE_RUN_RECORD", `Run Graph repeats Record ${record.id}`);
    recordIds.add(record.id);
  }
  const candidateIds = new Set<string>();
  for (const candidate of graph.candidates) {
    assert(!candidateIds.has(candidate.id), "DUPLICATE_RUN_CANDIDATE", `Run Graph repeats Candidate ${candidate.id}`);
    candidateIds.add(candidate.id);
  }
  const operationIds = new Set<string>();
  for (const operation of graph.operations) {
    assert(!operationIds.has(operation.id), "DUPLICATE_RUN_OPERATION", `Run Graph repeats Operation ${operation.id}`);
    operationIds.add(operation.id);
  }
  const satisfiedOutputs = new Set<string>();
  for (const satisfaction of graph.satisfactions) {
    assert(!satisfiedOutputs.has(satisfaction.output), "DUPLICATE_RUN_SATISFACTION", `Run Graph satisfies ${satisfaction.output} more than once`);
    assert(candidateIds.has(satisfaction.candidate), "UNKNOWN_RUN_CANDIDATE", `Run Graph Satisfaction names absent Candidate ${satisfaction.candidate}`);
    satisfiedOutputs.add(satisfaction.output);
  }
  assert(graph.targets.length > 0, "EMPTY_RUN_TARGETS", "Run Graph has no Targets");
  const targets = new Set<string>();
  for (const target of graph.targets) {
    assert(!targets.has(target), "DUPLICATE_RUN_TARGET", `Run Graph repeats Target ${target}`);
    targets.add(target);
  }
}
