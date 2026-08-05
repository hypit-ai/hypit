import type {
  BuildRequest,
  Candidate,
  CandidateBinding,
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
} from "@svml/protocol";

import { canonicalize, digestOf, isDigest } from "./canonical.js";
import { invariant } from "./error.js";
import { resolveProducer, sealRecord, verifyRecord } from "./link.js";
import { producerKey, sameType, typeKey } from "./reference.js";

export const EMPTY_REALIZATION_DIGEST = digestOf({
  format: "svml.realization-closure@1",
  overlays: [],
});

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
    ...(root.value.validation === undefined ? {} : { validation: root.value.validation }),
    ...(root.value.provenance === undefined ? {} : { provenance: canonicalize(root.value.provenance) }),
  };
  return { kind: "value", value };
}

function normalizeOutput(output: LogicalOutput): LogicalOutput {
  const base = {
    id: output.id,
    type: output.type,
    primary: output.primary,
    candidates: [...output.candidates].sort(),
    semanticInputs: [...output.semanticInputs].map(normalizeRef).sort((a, b) =>
      valueRefKey(a).localeCompare(valueRefKey(b))),
  };
  return output.affinity === undefined
    ? base
    : {
        ...base,
        affinity: [...output.affinity]
          .map((constraint) => ({
            resultPointer: constraint.resultPointer,
            source: normalizeRef(constraint.source),
            sourcePointer: constraint.sourcePointer,
          }))
          .sort((a, b) => a.resultPointer.localeCompare(b.resultPointer)),
      };
}

function normalizeCandidate(candidate: Candidate): Candidate {
  return {
    id: candidate.id,
    output: candidate.output,
    root: normalizeRoot(candidate.root),
    fidelity: candidate.fidelity,
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
    accepts: result.accepts,
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
  graph: Omit<CompiledGraph, "format" | "id" | "source" | "realization">
    & Partial<Pick<CompiledGraph, "source" | "realization">>,
): CompiledGraph {
  const normalized = {
    program: graph.program,
    outputs: [...graph.outputs].map(normalizeOutput).sort((a, b) => a.id.localeCompare(b.id)),
    candidates: [...graph.candidates].map(normalizeCandidate).sort((a, b) => a.id.localeCompare(b.id)),
    operations: [...graph.operations].map(normalizeOperation).sort((a, b) => a.id.localeCompare(b.id)),
  };
  const source = graph.source ?? digestOf({ format: "svml.graph-source@1", ...normalized });
  const realization = graph.realization ?? EMPTY_REALIZATION_DIGEST;
  const content = {
    format: "svml.graph@1" as const,
    ...normalized,
    source,
    realization,
  };
  return { ...content, id: digestOf(content) };
}

export function sealBuildRequest(
  request: Omit<BuildRequest, "format" | "digest">,
): BuildRequest {
  const targets = [...request.targets]
    .map((target) => ({ output: target.output, accepts: target.accepts }))
    .sort((a, b) => a.output.localeCompare(b.output));
  const bindings = [...request.bindings]
    .map((binding) => ({ output: binding.output, candidate: binding.candidate }))
    .sort((a, b) => a.output.localeCompare(b.output));
  const content = {
    format: "svml.build-request@1" as const,
    graph: request.graph,
    targets,
    bindings,
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

export function bindingForOutput(
  request: BuildRequest,
  output: string,
): CandidateBinding | undefined {
  return request.bindings.find((binding) => binding.output === output);
}

export function selectedCandidate(
  graph: CompiledGraph,
  request: BuildRequest,
  outputId: string,
): Candidate {
  const output = resolveLogicalOutput(graph, outputId);
  const binding = bindingForOutput(request, outputId);
  const candidate = resolveCandidate(graph, binding?.candidate ?? output.primary);
  invariant(
    candidate.output === output.id,
    "CANDIDATE_OUTPUT_MISMATCH",
    `${candidate.id} cannot realize ${output.id}`,
    candidate.id,
  );
  return candidate;
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

function verifyAffinityPointer(pointer: string, subject: string): void {
  invariant(
    pointer === "" || pointer.startsWith("/"),
    "INVALID_AFFINITY_POINTER",
    `${subject} has invalid JSON Pointer ${pointer}`,
    subject,
  );
  for (const token of pointer === "" ? [] : pointer.slice(1).split("/")) {
    invariant(
      !/~(?:[^01]|$)/u.test(token),
      "INVALID_AFFINITY_POINTER",
      `${subject} has invalid JSON Pointer escape in ${pointer}`,
      subject,
    );
  }
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
    invariant(
      operation.result.accepts === "exact" || operation.result.accepts === "substitute",
      "INVALID_NEED_ACCEPTANCE",
      `${operation.id} Need acceptance is invalid`,
    );
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

function semanticLeaves(graph: CompiledGraph, root: CandidateRoot): Set<string> {
  const leaves = new Set<string>();
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visitRef = (ref: GraphValueRef): void => {
    if (ref.kind !== "operation-result") {
      leaves.add(valueRefKey(ref));
      return;
    }
    if (visited.has(ref.operation)) return;
    invariant(
      !visiting.has(ref.operation),
      "OPERATION_CYCLE",
      `Operation cycle reaches ${ref.operation}`,
      ref.operation,
    );
    visiting.add(ref.operation);
    const operation = resolveOperation(graph, ref.operation);
    Object.values(operation.inputs).forEach(visitRef);
    visiting.delete(ref.operation);
    visited.add(ref.operation);
  };

  if (root.kind === "operation") visitRef(root.result);
  return leaves;
}

function candidateType(program: LinkedProgram, graph: CompiledGraph, candidate: Candidate): TypeRef {
  const output = resolveLogicalOutput(graph, candidate.output);
  if (candidate.root.kind === "operation") {
    return operationResultType(program, resolveOperation(graph, candidate.root.result.operation));
  }
  const provisional = sealRecord({
    id: candidate.root.value.id,
    type: output.type,
    value: candidate.root.value.value,
    conformance: candidate.fidelity,
    origin: {
      kind: "provided",
      candidate: candidate.id,
      requestDigest: digestOf(`candidate:${candidate.id}`),
      ...(candidate.root.value.provenance === undefined
        ? {}
        : { provenance: candidate.root.value.provenance }),
    },
    ...(candidate.root.value.validation === undefined
      ? {}
      : { validation: candidate.root.value.validation }),
  });
  verifyRecord(program.closure, provisional);
  return provisional.type;
}

export function verifyCompiledGraph(program: LinkedProgram, graph: CompiledGraph): void {
  invariant(graph.format === "svml.graph@1", "UNSUPPORTED_GRAPH", "unsupported compiled graph format");
  invariant(isDigest(graph.id), "INVALID_DIGEST", "compiled graph id is invalid");
  invariant(isDigest(graph.source), "INVALID_DIGEST", "compiled graph source digest is invalid");
  invariant(isDigest(graph.realization), "INVALID_DIGEST", "compiled graph realization digest is invalid");
  invariant(
    graph.program === program.semanticDigest,
    "GRAPH_PROGRAM_MISMATCH",
    "compiled graph belongs to another linked program",
  );
  const { id: _id, ...content } = graph;
  invariant(graph.id === digestOf(content), "GRAPH_DIGEST_MISMATCH", "compiled graph digest differs");
  if (graph.realization === EMPTY_REALIZATION_DIGEST) {
    invariant(
      graph.source === digestOf({
        format: "svml.graph-source@1",
        program: graph.program,
        outputs: graph.outputs,
        candidates: graph.candidates,
        operations: graph.operations,
      }),
      "GRAPH_SOURCE_DIGEST_MISMATCH",
      "author graph source digest differs",
    );
  }

  const outputIds = new Set<string>();
  const candidateIds = new Set<string>();
  const operationIds = new Set<string>();
  const operationRecords = new Set(program.records.map((record) => record.id));
  const needIds = new Set<string>();

  for (const output of graph.outputs) {
    invariant(output.id.length > 0, "EMPTY_LOGICAL_OUTPUT_ID", "Logical Output id is empty");
    invariant(!outputIds.has(output.id), "DUPLICATE_LOGICAL_OUTPUT", `duplicate ${output.id}`, output.id);
    outputIds.add(output.id);
    const semanticInputs = output.semanticInputs.map(valueRefKey);
    invariant(
      new Set(semanticInputs).size === semanticInputs.length,
      "DUPLICATE_SEMANTIC_INPUT",
      `${output.id} repeats a Semantic Input`,
      output.id,
    );
    const pointers = new Set<string>();
    for (const constraint of output.affinity ?? []) {
      verifyAffinityPointer(constraint.resultPointer, output.id);
      verifyAffinityPointer(constraint.sourcePointer, output.id);
      invariant(!pointers.has(constraint.resultPointer), "DUPLICATE_AFFINITY", `${output.id} repeats affinity`);
      pointers.add(constraint.resultPointer);
      graphValueType(program, graph, constraint.source);
    }
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
    const output = resolveLogicalOutput(graph, candidate.output);
    invariant(
      output.candidates.includes(candidate.id),
      "CANDIDATE_NOT_EXPOSED",
      `${candidate.id} is not exposed by ${output.id}`,
      candidate.id,
    );
    invariant(
      candidate.fidelity === "exact" || candidate.fidelity === "substitute",
      "INVALID_CONFORMANCE",
      `${candidate.id} fidelity is invalid`,
    );
    const supplied = candidateType(program, graph, candidate);
    invariant(
      sameType(supplied, output.type),
      "CANDIDATE_RESULT_TYPE_MISMATCH",
      `${candidate.id} returns ${typeKey(supplied)}, not ${typeKey(output.type)}`,
      candidate.id,
    );
    const allowed = new Set(output.semanticInputs.map(valueRefKey));
    for (const leaf of semanticLeaves(graph, candidate.root)) {
      invariant(
        allowed.has(leaf),
        "CANDIDATE_EXCEEDS_SEMANTIC_ENVELOPE",
        `${candidate.id} depends on ${leaf} outside ${output.id}'s Semantic Input Envelope`,
        candidate.id,
      );
    }
  }

  for (const output of graph.outputs) {
    invariant(output.candidates.length > 0, "OUTPUT_WITHOUT_CANDIDATE", `${output.id} has no Candidates`);
    invariant(
      new Set(output.candidates).size === output.candidates.length,
      "DUPLICATE_OUTPUT_CANDIDATE",
      `${output.id} repeats a Candidate`,
      output.id,
    );
    const primary = resolveCandidate(graph, output.primary);
    invariant(primary.output === output.id, "PRIMARY_OUTPUT_MISMATCH", `${output.id} Primary belongs elsewhere`);
    invariant(output.candidates.includes(primary.id), "PRIMARY_NOT_EXPOSED", `${output.id} omits its Primary`);
    invariant(primary.fidelity === "exact", "PRIMARY_NOT_EXACT", `${output.id} Primary must be exact`);
    for (const id of output.candidates) {
      const candidate = resolveCandidate(graph, id);
      invariant(candidate.output === output.id, "CANDIDATE_OUTPUT_MISMATCH", `${id} belongs elsewhere`);
    }
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
  const { digest: _digest, ...content } = request;
  invariant(request.digest === digestOf(content), "BUILD_REQUEST_DIGEST_MISMATCH", "BuildRequest digest differs");
  invariant(request.targets.length > 0, "EMPTY_BUILD_TARGETS", "BuildRequest has no Targets");

  const targets = new Set<string>();
  for (const target of request.targets) {
    resolveLogicalOutput(graph, target.output);
    invariant(!targets.has(target.output), "DUPLICATE_BUILD_TARGET", `${target.output} is targeted twice`);
    invariant(
      target.accepts === "exact" || target.accepts === "substitute",
      "INVALID_TARGET_ACCEPTANCE",
      target.output,
    );
    targets.add(target.output);
  }

  const bindings = new Set<string>();
  for (const binding of request.bindings) {
    const output = resolveLogicalOutput(graph, binding.output);
    invariant(!bindings.has(output.id), "DUPLICATE_CANDIDATE_BINDING", `${output.id} is bound twice`);
    const candidate = resolveCandidate(graph, binding.candidate);
    invariant(candidate.output === output.id, "CANDIDATE_OUTPUT_MISMATCH", `${candidate.id} cannot realize ${output.id}`);
    bindings.add(output.id);
  }
}

export function sameProducerRef(left: ProducerRef, right: ProducerRef): boolean {
  return producerKey(left) === producerKey(right);
}
