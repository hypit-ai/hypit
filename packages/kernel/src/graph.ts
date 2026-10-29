import type {
  OutputRoot,
  AuthorGraph,
  GraphValueRef,
  LinkedProgram,
  LogicalOutput,
  OperationNode,
  OperationResult,
  TypeRef,
  TypedRecord,
} from "@hypit/protocol";

import { compareCodeUnits, sameType, typeKey } from "@hypit/protocol";
import { invariant } from "./error.js";
import { resolveCapability, resolveProducer, verifyRecordStructure } from "./link.js";

type GraphIndex = {
  readonly outputs: ReadonlyMap<string, LogicalOutput>;
  readonly operations: ReadonlyMap<string, OperationNode>;
};

const graphIndexes = new WeakMap<AuthorGraph, GraphIndex>();
const programRecordIndexes = new WeakMap<LinkedProgram, ReadonlyMap<string, LinkedProgram["records"][number]>>();

function graphIndex(graph: AuthorGraph): GraphIndex {
  const existing = graphIndexes.get(graph);
  if (existing !== undefined) return existing;
  const created = {
    outputs: new Map(graph.outputs.map((item) => [item.id, item])),
    operations: new Map(graph.operations.map((item) => [item.id, item])),
  };
  graphIndexes.set(graph, created);
  return created;
}
function programRecords(program: LinkedProgram): ReadonlyMap<string, LinkedProgram["records"][number]> {
  const existing = programRecordIndexes.get(program);
  if (existing !== undefined) return existing;
  const created = new Map(program.records.map((item) => [item.id, item]));
  programRecordIndexes.set(program, created);
  return created;
}

function normalizeRef(ref: GraphValueRef): GraphValueRef {
  if (ref.kind === "record") return { kind: "record", id: ref.id };
  if (ref.kind === "logical-output") return { kind: "logical-output", id: ref.id };
  return { kind: "operation-result", operation: ref.operation };
}

function normalizeRoot(root: OutputRoot): OutputRoot {
  if (root.kind === "record") return { kind: "record", id: root.id };
  return { kind: "operation-result", operation: root.operation };
}

function normalizeOutput(output: LogicalOutput): LogicalOutput {
  return {
    id: output.id,
    type: output.type,
    primary: normalizeRoot(output.primary),
  };
}

function normalizeResult(result: OperationResult): OperationResult {
  if (result.kind === "output") {
    return { kind: "output", name: result.name, record: result.record };
  }
  return {
    kind: "need",
    name: result.name,
    id: result.id,
    record: result.record,
  };
}

function normalizeOperation(operation: OperationNode): OperationNode {
  return {
    id: operation.id,
    producer: operation.producer,
    inputs: Object.fromEntries(
      Object.entries(operation.inputs)
        .sort(([a], [b]) => compareCodeUnits(a, b))
        .map(([name, ref]) => [name, normalizeRef(ref)]),
    ),
    result: normalizeResult(operation.result),
  };
}

export function sealAuthorGraph(
  graph: Omit<AuthorGraph, "format">,
): AuthorGraph {
  const normalized = {
    outputs: [...graph.outputs].map(normalizeOutput).sort((a, b) => compareCodeUnits(a.id, b.id)),
    operations: [...graph.operations].map(normalizeOperation).sort((a, b) => compareCodeUnits(a.id, b.id)),
  };
  return {
    format: "hypit.graph@1" as const,
    ...normalized,
  };
}

export function resolveLogicalOutput(graph: AuthorGraph, id: string): LogicalOutput {
  const output = graphIndex(graph).outputs.get(id);
  invariant(output !== undefined, "UNKNOWN_LOGICAL_OUTPUT", `unknown logical output ${id}`, id);
  return output;
}

export function resolveOperation(graph: AuthorGraph, id: string): OperationNode {
  const operation = graphIndex(graph).operations.get(id);
  invariant(operation !== undefined, "UNKNOWN_OPERATION", `unknown Operation ${id}`, id);
  return operation;
}

export function operationResultRecord(operation: OperationNode): string {
  return operation.result.record;
}

function operationResultType(program: LinkedProgram, operation: OperationNode): TypeRef {
  const producer = resolveProducer(program.closure, operation.producer);
  if (operation.result.kind === "output") {
    const output = producer.result;
    invariant(
      output.kind === "output" && output.name === operation.result.name,
      "OPERATION_RESULT_MISMATCH",
      `${operation.id} does not produce output ${operation.result.name}`,
      operation.id,
    );
    return output.type;
  }
  const need = producer.result;
  invariant(
    need.kind === "need" && need.name === operation.result.name,
    "OPERATION_RESULT_MISMATCH",
    `${operation.id} does not request Need ${operation.result.name}`,
    operation.id,
  );
  return resolveCapability(program.closure, need.capability).returns;
}

function graphValueType(program: LinkedProgram, graph: AuthorGraph, ref: GraphValueRef): TypeRef {
  if (ref.kind === "record") {
    const record = programRecords(program).get(ref.id);
    invariant(record !== undefined, "UNKNOWN_GRAPH_INPUT", `unknown authored record ${ref.id}`, ref.id);
    return record.type;
  }
  if (ref.kind === "logical-output") return resolveLogicalOutput(graph, ref.id).type;
  return operationResultType(program, resolveOperation(graph, ref.operation));
}

function exactKeys(
  actual: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  subject: string,
): void {
  const left = Object.keys(actual).sort();
  const right = [...expected].sort();
  invariant(
    JSON.stringify(left) === JSON.stringify(right),
    "GRAPH_PORT_BINDING_MISMATCH",
    `${subject} binds [${left.join(", ")}] but declares [${right.join(", ")}]`,
    subject,
  );
}

function verifyOperation(program: LinkedProgram, graph: AuthorGraph, operation: OperationNode): void {
  invariant(operation.id.length > 0, "EMPTY_OPERATION_ID", "Operation id is empty");
  invariant(operation.result.record.length > 0, "EMPTY_RECORD_ID", `${operation.id} result record is empty`);
  const producer = resolveProducer(program.closure, operation.producer);
  exactKeys(operation.inputs, producer.inputs.map((port) => port.name), `${operation.id}.inputs`);
  operationResultType(program, operation);
  if (operation.result.kind === "need") {
    invariant(operation.result.id.length > 0, "EMPTY_NEED_ID", `${operation.id} Need id is empty`);
  }
  for (const declaration of producer.inputs) {
    const supplied = graphValueType(program, graph, operation.inputs[declaration.name] as GraphValueRef);
    invariant(
      sameType(supplied, declaration.type),
      "GRAPH_INPUT_TYPE_MISMATCH",
      `${operation.id}.${declaration.name} wants ${typeKey(declaration.type)} but receives ${typeKey(supplied)}`,
      operation.id,
    );
  }
}

export function verifyOutputRoot(
  program: LinkedProgram,
  graph: AuthorGraph,
  output: LogicalOutput,
  root: OutputRoot,
): void {
  if (root.kind === "record") {
    const record = programRecords(program).get(root.id);
    invariant(
      record !== undefined,
      "UNKNOWN_OUTPUT_RECORD",
      output.id + " references unknown authored Record " + root.id,
      output.id,
    );
    invariant(
      sameType(record.type, output.type),
      "OUTPUT_RESULT_TYPE_MISMATCH",
      output.id + " declares " + typeKey(output.type)
        + " but Record " + record.id + " is " + typeKey(record.type),
      output.id,
    );
    return;
  }
  const supplied = operationResultType(program, resolveOperation(graph, root.operation));
  invariant(
    sameType(supplied, output.type),
    "OUTPUT_RESULT_TYPE_MISMATCH",
    `${output.id} declares ${typeKey(output.type)} but returns ${typeKey(supplied)}`,
    output.id,
  );
}

export function verifyAuthorGraph(program: LinkedProgram, graph: AuthorGraph): void {
  invariant(graph.format === "hypit.graph@1", "UNSUPPORTED_GRAPH", "unsupported Author Graph format");
  const outputIds = new Set<string>();
  const operationIds = new Set<string>();
  const operationRecords = new Set(program.records.map((record) => record.id));
  const needIds = new Set<string>();

  for (const output of graph.outputs) {
    invariant(output.id.length > 0, "EMPTY_LOGICAL_OUTPUT_ID", "Logical Output id is empty");
    invariant(!outputIds.has(output.id), "DUPLICATE_LOGICAL_OUTPUT", `duplicate ${output.id}`, output.id);
    outputIds.add(output.id);
  }

  for (const operation of graph.operations) {
    invariant(!operationIds.has(operation.id), "DUPLICATE_OPERATION", `duplicate ${operation.id}`, operation.id);
    operationIds.add(operation.id);
    invariant(
      !operationRecords.has(operation.result.record),
      "DUPLICATE_RECORD",
      `record ${operation.result.record} has multiple sources`,
      operation.result.record,
    );
    operationRecords.add(operation.result.record);
    if (operation.result.kind === "need") {
      invariant(!needIds.has(operation.result.id), "DUPLICATE_NEED", `duplicate Need ${operation.result.id}`);
      needIds.add(operation.result.id);
    }
  }
  for (const operation of graph.operations) verifyOperation(program, graph, operation);

  for (const output of graph.outputs) {
    verifyOutputRoot(program, graph, output, output.primary);
  }
}
