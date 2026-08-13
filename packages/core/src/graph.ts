import type {
  BuildRequest,
  Candidate,
  CandidateRoot,
  CompiledGraph,
  GraphValueRef,
  LinkedProgram,
  LogicalOutput,
  OperationNode,
  OperationResult,
  ProducerRef,
  StoredValue,
  TypeRef,
} from "@narratage/protocol";

import { canonicalize, digestOf, isDigest } from "./canonical.js";
import { invariant } from "./error.js";
import { resolveProducer, sealRecord, verifyRecordStructure } from "./link.js";
import { producerKey, sameType, typeKey } from "./reference.js";

export function valueRefKey(ref: GraphValueRef): string {
  if (ref.kind === "record") return `record\u0000${ref.id}`;
  if (ref.kind === "logical-output") return `output\u0000${ref.id}`;
  return `operation\u0000${ref.operation}`;
}

function normalizeRef(ref: GraphValueRef): GraphValueRef {
  if (ref.kind === "record") return { kind: "record", id: ref.id };
  if (ref.kind === "logical-output") return { kind: "logical-output", id: ref.id };
  return { kind: "operation-result", operation: ref.operation };
}

function normalizedStoredValue(value: StoredValue): StoredValue {
  if (value.kind === "inline") return { kind: "inline", value: canonicalize(value.value) };
  return { kind: "blob", digest: value.digest, size: value.size, mediaType: value.mediaType };
}

function normalizeRoot(root: CandidateRoot): CandidateRoot {
  if (root.kind === "operation") {
    return { kind: "operation", result: { kind: "operation-result", operation: root.result.operation } };
  }
  const value = {
    id: root.value.id,
    value: normalizedStoredValue(root.value.value),
  };
  return { kind: "value", value };
}

function normalizeOutput(output: LogicalOutput): LogicalOutput {
  return {
    id: output.id,
    type: output.type,
    primary: output.primary,
  };
}

function normalizeCandidate(candidate: Candidate): Candidate {
  return {
    id: candidate.id,
    type: candidate.type,
    root: normalizeRoot(candidate.root),
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
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, ref]) => [name, normalizeRef(ref)]),
    ),
    result: normalizeResult(operation.result),
  };
}

export function sealCompiledGraph(
  graph: Omit<CompiledGraph, "format" | "id">,
): CompiledGraph {
  const normalized = {
    program: graph.program,
    outputs: [...graph.outputs].map(normalizeOutput).sort((a, b) => a.id.localeCompare(b.id)),
    candidates: [...graph.candidates].map(normalizeCandidate).sort((a, b) => a.id.localeCompare(b.id)),
    operations: [...graph.operations].map(normalizeOperation).sort((a, b) => a.id.localeCompare(b.id)),
  };
  const content = {
    format: "svml.graph@1" as const,
    ...normalized,
  };
  return { ...content, id: digestOf(content) };
}

export function sealBuildRequest(
  request: Omit<BuildRequest, "format" | "digest">,
): BuildRequest {
  const targets = [...request.targets]
    .map((target) => ({ output: target.output }))
    .sort((a, b) => a.output.localeCompare(b.output));
  const content = {
    format: "svml.build-request@1" as const,
    graph: request.graph,
    ...(request.implementationClosure === undefined
      ? {}
      : { implementationClosure: request.implementationClosure }),
    targets,
  };
  return { ...content, digest: digestOf(content) };
}

export function resolveLogicalOutput(graph: CompiledGraph, id: string): LogicalOutput {
  const output = graph.outputs.find((item) => item.id === id);
  invariant(output !== undefined, "UNKNOWN_LOGICAL_OUTPUT", `unknown logical output ${id}`, id);
  return output;
}

export function resolveCandidate(graph: CompiledGraph, id: string): Candidate {
  const candidate = graph.candidates.find((item) => item.id === id);
  invariant(candidate !== undefined, "UNKNOWN_CANDIDATE", `unknown Candidate ${id}`, id);
  return candidate;
}

export function resolveOperation(graph: CompiledGraph, id: string): OperationNode {
  const operation = graph.operations.find((item) => item.id === id);
  invariant(operation !== undefined, "UNKNOWN_OPERATION", `unknown Operation ${id}`, id);
  return operation;
}

export function satisfiedCandidate(
  graph: CompiledGraph,
  outputId: string,
): Candidate {
  const output = resolveLogicalOutput(graph, outputId);
  return resolveCandidate(graph, output.primary);
}

export function operationResultRecord(operation: OperationNode): string {
  return operation.result.record;
}

export function operationResultType(program: LinkedProgram, operation: OperationNode): TypeRef {
  const producer = resolveProducer(program.closure, operation.producer);
  if (operation.result.kind === "output") {
    const output = producer.outputs.find((port) => port.name === operation.result.name);
    invariant(
      output !== undefined && producer.needs.length === 0,
      "OPERATION_RESULT_MISMATCH",
      `${operation.id} does not produce output ${operation.result.name}`,
      operation.id,
    );
    return output.type;
  }
  const need = producer.needs.find((port) => port.name === operation.result.name);
  invariant(
    need !== undefined && producer.outputs.length === 0,
    "OPERATION_RESULT_MISMATCH",
    `${operation.id} does not request Need ${operation.result.name}`,
    operation.id,
  );
  return need.returns;
}

function graphValueType(program: LinkedProgram, graph: CompiledGraph, ref: GraphValueRef): TypeRef {
  if (ref.kind === "record") {
    const record = program.records.find((item) => item.id === ref.id);
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

function verifyOperation(program: LinkedProgram, graph: CompiledGraph, operation: OperationNode): void {
  invariant(operation.id.length > 0, "EMPTY_OPERATION_ID", "Operation id is empty");
  invariant(operation.result.record.length > 0, "EMPTY_RECORD_ID", `${operation.id} result record is empty`);
  const producer = resolveProducer(program.closure, operation.producer);
  exactKeys(operation.inputs, producer.inputs.map((port) => port.name), `${operation.id}.inputs`);
  invariant(
    producer.outputs.length + producer.needs.length === 1,
    "PRODUCER_RESULT_NORMAL_FORM",
    `${producerKey(operation.producer)} must declare exactly one public result`,
  );
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

function verifyCandidateValue(program: LinkedProgram, graph: CompiledGraph, candidate: Candidate): void {
  if (candidate.root.kind === "operation") {
    const supplied = operationResultType(program, resolveOperation(graph, candidate.root.result.operation));
    invariant(
      sameType(supplied, candidate.type),
      "CANDIDATE_RESULT_TYPE_MISMATCH",
      `${candidate.id} declares ${typeKey(candidate.type)} but returns ${typeKey(supplied)}`,
      candidate.id,
    );
    return;
  }
  const provisional = sealRecord({
    id: candidate.root.value.id,
    type: candidate.type,
    value: candidate.root.value.value,
    origin: {
      kind: "provided",
    },
  });
  verifyRecordStructure(program.closure, provisional);
}

function verifySatisfaction(
  output: LogicalOutput,
  candidate: Candidate,
): void {
  invariant(
    sameType(candidate.type, output.type),
    "CANDIDATE_RESULT_TYPE_MISMATCH",
    `${candidate.id} supplies ${typeKey(candidate.type)}, not ${typeKey(output.type)}`,
    candidate.id,
  );
}

export function verifyCompiledGraph(program: LinkedProgram, graph: CompiledGraph): void {
  invariant(graph.format === "svml.graph@1", "UNSUPPORTED_GRAPH", "unsupported compiled graph format");
  invariant(isDigest(graph.id), "INVALID_DIGEST", "compiled graph id is invalid");
  invariant(
    graph.program === program.semanticDigest,
    "GRAPH_PROGRAM_MISMATCH",
    "compiled graph belongs to another linked program",
  );
  const { id: _id, ...content } = graph;
  invariant(graph.id === digestOf(content), "GRAPH_DIGEST_MISMATCH", "compiled graph digest differs");
  const outputIds = new Set<string>();
  const candidateIds = new Set<string>();
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

  for (const candidate of graph.candidates) {
    invariant(candidate.id.length > 0, "EMPTY_CANDIDATE_ID", "Candidate id is empty");
    invariant(!candidateIds.has(candidate.id), "DUPLICATE_CANDIDATE", `duplicate ${candidate.id}`, candidate.id);
    candidateIds.add(candidate.id);
    verifyCandidateValue(program, graph, candidate);
  }

  for (const output of graph.outputs) {
    const primary = resolveCandidate(graph, output.primary);
    verifySatisfaction(output, primary);
  }
}

export function verifyBuildRequest(
  program: LinkedProgram,
  graph: CompiledGraph,
  request: BuildRequest,
): void {
  verifyCompiledGraph(program, graph);
  invariant(
    request.format === "svml.build-request@1",
    "UNSUPPORTED_BUILD_REQUEST",
    "unsupported BuildRequest format",
  );
  invariant(isDigest(request.digest), "INVALID_DIGEST", "BuildRequest digest is invalid");
  invariant(request.graph === graph.id, "BUILD_REQUEST_GRAPH_MISMATCH", "BuildRequest belongs to another graph");
  invariant(
    request.implementationClosure === undefined || isDigest(request.implementationClosure),
    "INVALID_IMPLEMENTATION_CLOSURE_DIGEST",
    "BuildRequest implementation closure digest is invalid",
  );
  const { digest: _digest, ...content } = request;
  invariant(request.digest === digestOf(content), "BUILD_REQUEST_DIGEST_MISMATCH", "BuildRequest digest differs");
  invariant(request.targets.length > 0, "EMPTY_BUILD_TARGETS", "BuildRequest has no Targets");

  const targets = new Set<string>();
  for (const target of request.targets) {
    resolveLogicalOutput(graph, target.output);
    invariant(!targets.has(target.output), "DUPLICATE_BUILD_TARGET", `${target.output} is targeted twice`);
    targets.add(target.output);
  }

}
