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
    targets: [...graph.targets].sort((left, right) => left.output.localeCompare(right.output)),
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
  assert(graph.targets.length > 0, "EMPTY_RUN_TARGETS", "Run Graph has no Targets");
  const targets = new Set<string>();
  for (const target of graph.targets) {
    assert(!targets.has(target.output), "DUPLICATE_RUN_TARGET", `Run Graph repeats Target ${target.output}`);
    targets.add(target.output);
  }
  assert(graph.id === digestOf(content(graph)), "RUN_GRAPH_DIGEST_MISMATCH", "Run Graph digest differs");
}
