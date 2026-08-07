import {
  digestOf,
  isDigest,
} from "@narratage/protocol";

import type { RunGraph } from "./types.js";

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

function content(graph: RunGraph): Omit<RunGraph, "id"> {
  return {
    format: "svml.run-graph@1",
    authorGraph: graph.authorGraph,
    sourceClosure: graph.sourceClosure,
    candidates: [...graph.candidates].sort((left, right) => left.id.localeCompare(right.id)),
    operations: [...graph.operations].sort((left, right) => left.id.localeCompare(right.id)),
    satisfactions: [...graph.satisfactions].sort((left, right) => left.output.localeCompare(right.output)),
    targetSets: [...graph.targetSets]
      .map((set) => ({
        id: set.id,
        targets: [...set.targets].sort((left, right) => left.output.localeCompare(right.output)),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    selectedTargets: graph.selectedTargets,
  };
}

export function sealRunGraph(input: Omit<RunGraph, "format" | "id">): RunGraph {
  const normalized = content({ format: "svml.run-graph@1", id: digestOf(null), ...input });
  const graph: RunGraph = { ...normalized, id: digestOf(normalized) };
  verifyRunGraph(graph);
  return graph;
}

export function verifyRunGraph(graph: RunGraph): void {
  assert(graph.format === "svml.run-graph@1", "UNSUPPORTED_RUN_GRAPH", "unsupported Run Graph");
  assert(isDigest(graph.id), "INVALID_RUN_GRAPH_DIGEST", "Run Graph digest is invalid");
  assert(isDigest(graph.authorGraph), "INVALID_RUN_AUTHOR_GRAPH", "Run Graph Author Graph digest is invalid");
  assert(isDigest(graph.sourceClosure), "INVALID_RUN_SOURCE_CLOSURE", "Run Graph Source Closure digest is invalid");
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
  const targetIds = new Set<string>();
  for (const set of graph.targetSets) {
    assert(set.id.length > 0 && !targetIds.has(set.id), "DUPLICATE_RUN_TARGET_SET", `Run Graph repeats Target Set ${set.id}`);
    assert(set.targets.length > 0, "EMPTY_RUN_TARGET_SET", `Run Target Set ${set.id} is empty`);
    const outputs = new Set<string>();
    for (const target of set.targets) {
      assert(!outputs.has(target.output), "DUPLICATE_RUN_TARGET", `Run Target Set ${set.id} repeats ${target.output}`);
      outputs.add(target.output);
    }
    targetIds.add(set.id);
  }
  assert(targetIds.has(graph.selectedTargets), "UNKNOWN_SELECTED_TARGET_SET", `Run Graph selects absent Target Set ${graph.selectedTargets}`);
  assert(graph.id === digestOf(content(graph)), "RUN_GRAPH_DIGEST_MISMATCH", "Run Graph digest differs");
}
