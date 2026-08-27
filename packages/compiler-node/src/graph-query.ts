import {
  resolveCandidate,
  resolveLogicalOutput,
  resolveOperation,
} from "@hypit/core";
import type {
  Candidate,
  CompiledGraph,
  GraphValueRef,
  LogicalOutput,
  OperationNode,
  ProducerRef,
} from "@hypit/protocol";

/** Read-only Graph helpers shared by preview and other host tooling. */

export function findLogicalOutput(graph: CompiledGraph, outputId: string): LogicalOutput | undefined {
  try { return resolveLogicalOutput(graph, outputId); } catch { return undefined; }
}

export function findCandidate(graph: CompiledGraph, candidateId: string): Candidate | undefined {
  try { return resolveCandidate(graph, candidateId); } catch { return undefined; }
}

export function findOperation(graph: CompiledGraph, operationId: string): OperationNode | undefined {
  try { return resolveOperation(graph, operationId); } catch { return undefined; }
}

export function findOperationsByProducer(graph: CompiledGraph, producer: ProducerRef): readonly OperationNode[] {
  return graph.operations.filter((operation) =>
    operation.producer.module.name === producer.module.name
    && operation.producer.module.version === producer.module.version
    && operation.producer.name === producer.name,
  );
}

/** Walk operation inputs in dependency order, excluding authored Records and Logical Outputs. */
export function walkOperationInputs(graph: CompiledGraph, operationId: string): readonly OperationNode[] {
  const result: OperationNode[] = [];
  const visited = new Set<string>();
  const visitRef = (ref: GraphValueRef): void => {
    if (ref.kind !== "operation-result" || visited.has(ref.operation)) return;
    const operation = findOperation(graph, ref.operation);
    if (operation === undefined) return;
    visited.add(ref.operation);
    for (const input of Object.values(operation.inputs)) visitRef(input);
    result.push(operation);
  };
  visitRef({ kind: "operation-result", operation: operationId });
  return result;
}
