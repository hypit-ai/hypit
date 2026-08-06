import type {
  BuildPlan,
  CompiledGraph,
  GraphValueRef,
  LinkedProgram,
  ProducerStep,
  StoredValue,
  TypedRecord,
} from "@svml/protocol";

import { canonicalStringify } from "./canonical.js";
import { invariant } from "./error.js";
import {
  resolveLogicalOutput,
  resolveOperation,
} from "./graph.js";
import { resolveProducer } from "./link.js";

function pointerTokens(pointer: string): string[] {
  invariant(
    pointer === "" || pointer.startsWith("/"),
    "INVALID_AFFINITY_POINTER",
    `affinity pointer ${pointer} is not a JSON Pointer`,
  );
  if (pointer === "") return [];
  return pointer.slice(1).split("/").map((token) => {
    invariant(
      !/~(?:[^01]|$)/u.test(token),
      "INVALID_AFFINITY_POINTER",
      `affinity pointer ${pointer} has an invalid escape`,
    );
    return token.replaceAll("~1", "/").replaceAll("~0", "~");
  });
}

function atPointer(value: unknown, pointer: string, subject: string): unknown {
  let current = value;
  for (const token of pointerTokens(pointer)) {
    invariant(
      current !== null && typeof current === "object",
      "AFFINITY_PATH_MISSING",
      `${subject}${pointer} does not exist`,
      subject,
    );
    if (Array.isArray(current)) {
      invariant(/^0$|^[1-9][0-9]*$/u.test(token), "AFFINITY_PATH_MISSING", `${subject}${pointer} is invalid`);
      current = current[Number(token)];
    } else {
      invariant(Object.hasOwn(current, token), "AFFINITY_PATH_MISSING", `${subject}${pointer} does not exist`);
      current = (current as Readonly<Record<string, unknown>>)[token];
    }
  }
  invariant(current !== undefined, "AFFINITY_PATH_MISSING", `${subject}${pointer} is undefined`, subject);
  return current;
}

function affinityValue(value: StoredValue): unknown {
  // BlobRef is a first-class StoredValue and has stable JSON fields. Treating it
  // as its own affinity value lets generic packages prove that a projected
  // artifact is the exact member of an inline Product without wrapping bytes in
  // a domain-specific object.
  return value.kind === "inline" ? value.value : value;
}

function sourceRecordId(graph: CompiledGraph, plan: BuildPlan, source: GraphValueRef): string {
  if (source.kind === "record") return source.id;
  if (source.kind === "operation-result") return resolveOperation(graph, source.operation).result.record;
  const selection = plan.selections.find((item) => item.output === source.id);
  invariant(
    selection !== undefined,
    "UNDEMANDED_AFFINITY_SOURCE",
    `${source.id} is required to prove exact affinity but is not demanded`,
    source.id,
  );
  return selection.record;
}

export function verifyRecordAffinity(
  graph: CompiledGraph,
  plan: BuildPlan,
  outputId: string,
  record: TypedRecord,
  lookup: (id: string) => TypedRecord | undefined,
): void {
  if (record.conformance === "substitute") return;
  const output = resolveLogicalOutput(graph, outputId);
  for (const constraint of output.affinity ?? []) {
    const sourceId = sourceRecordId(graph, plan, constraint.source);
    const source = lookup(sourceId);
    invariant(
      source !== undefined,
      "UNPROVEN_EXACT_AFFINITY",
      `${outputId} cannot prove affinity to ${sourceId}; provide that source or mark this Candidate substitute`,
      outputId,
    );
    const resultValue = atPointer(affinityValue(record.value), constraint.resultPointer, record.id);
    const sourceValue = atPointer(affinityValue(source.value), constraint.sourcePointer, source.id);
    invariant(
      canonicalStringify(resultValue) === canonicalStringify(sourceValue),
      "AFFINITY_MISMATCH",
      `${record.id}${constraint.resultPointer} does not match ${source.id}${constraint.sourcePointer}`,
      record.id,
    );
  }
}

export function verifyGraphRecordAffinity(
  graph: CompiledGraph,
  plan: BuildPlan,
  record: TypedRecord,
  lookup: (id: string) => TypedRecord | undefined,
): void {
  for (const selection of plan.selections.filter((item) => item.record === record.id)) {
    verifyRecordAffinity(graph, plan, selection.output, record, lookup);
  }
}

export function verifyInitialAffinities(
  graph: CompiledGraph,
  plan: BuildPlan,
  authored: readonly TypedRecord[],
): void {
  const records = new Map([...authored, ...plan.initialValues].map((record) => [record.id, record]));
  for (const record of plan.initialValues) {
    verifyGraphRecordAffinity(graph, plan, record, (id) => records.get(id));
  }
}

function resultPortForRecord(
  program: LinkedProgram,
  step: ProducerStep,
  recordId: string,
) {
  const producer = resolveProducer(program.closure, step.producer);
  const output = Object.entries(step.outputs).find(([, id]) => id === recordId);
  if (output !== undefined) return producer.outputs.find((port) => port.name === output[0]);
  const need = Object.entries(step.needs).find(([, binding]) => binding.result === recordId);
  return need === undefined ? undefined : producer.needs.find((port) => port.name === need[0]);
}

/** Verify the result-to-input identity promises declared by the Producer itself. */
export function verifyProducerRecordAffinity(
  program: LinkedProgram,
  plan: BuildPlan,
  record: TypedRecord,
  lookup: (id: string) => TypedRecord | undefined,
): void {
  if (record.conformance === "substitute") return;
  const step = plan.steps.find((item) =>
    Object.values(item.outputs).includes(record.id)
      || Object.values(item.needs).some((binding) => binding.result === record.id));
  if (step === undefined) return;
  const port = resultPortForRecord(program, step, record.id);
  invariant(port !== undefined, "UNKNOWN_RESULT_PORT", `${record.id} has no Producer result port`, record.id);
  for (const affinity of port.affinity ?? []) {
    const inputId = step.inputs[affinity.input];
    invariant(
      inputId !== undefined,
      "UNKNOWN_AFFINITY_INPUT",
      `${step.id} has no input ${affinity.input}`,
      step.id,
    );
    const input = lookup(inputId);
    invariant(
      input !== undefined,
      "UNPROVEN_EXACT_AFFINITY",
      `${record.id} cannot prove affinity to ${inputId}`,
      record.id,
    );
    const resultValue = atPointer(affinityValue(record.value), affinity.resultPointer, record.id);
    const inputValue = atPointer(affinityValue(input.value), affinity.inputPointer, input.id);
    invariant(
      canonicalStringify(resultValue) === canonicalStringify(inputValue),
      "AFFINITY_MISMATCH",
      `${record.id}${affinity.resultPointer} does not match ${input.id}${affinity.inputPointer}`,
      record.id,
    );
  }
}
