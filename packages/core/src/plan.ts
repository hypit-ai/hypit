import type {
  BuildPlan,
  BuildRequest,
  BuildState,
  CapabilityRef,
  CompiledGraph,
  GraphValueRef,
  LinkedProgram,
  NeedId,
  OperationNode,
  ProducerStep,
  RecordId,
  RunGraph,
  Satisfaction,
  StepId,
  TypeRef,
  TypedRecord,
} from "@hypit/protocol";

import { invariant } from "./error.js";
import {
  operationResultRecord,
  resolveCandidate,
  resolveLogicalOutput,
  resolveOperation,
  verifyBuildRequest,
} from "./graph.js";
import { resolveProducer } from "./link.js";
import { sameType, typeKey } from "./reference.js";

function exactKeys(
  actual: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  subject: string,
): void {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = [...expected].sort();
  invariant(
    JSON.stringify(actualKeys) === JSON.stringify(expectedKeys),
    "PORT_BINDING_MISMATCH",
    `${subject} binds [${actualKeys.join(", ")}] but declares [${expectedKeys.join(", ")}]`,
    subject,
  );
}

function subsetKeys(
  actual: Readonly<Record<string, unknown>>,
  declared: readonly string[],
  subject: string,
): void {
  const allowed = new Set(declared);
  for (const name of Object.keys(actual)) {
    invariant(allowed.has(name), "PORT_BINDING_MISMATCH", `${subject} binds undeclared port ${name}`, subject);
  }
}

type ResolvedSource = {
  readonly record: RecordId;
  readonly type: TypeRef;
};

type DemandedOperation = {
  readonly operation: OperationNode;
  readonly inputs: Readonly<Record<string, RecordId>>;
};

type ProducedRecord = {
  readonly type: TypeRef;
  readonly step?: string;
};

/** One external request the exact finite BuildPlan will make: which step asks, through which port. */
export type PlannedNeed = {
  readonly step: StepId;
  readonly port: string;
  readonly need: NeedId;
  readonly result: RecordId;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
};

const planStepIndexes = new WeakMap<BuildPlan, ReadonlyMap<string, ProducerStep>>();

/** Every external requirement of the BuildPlan, one entry per request, in step order. */
export function plannedNeeds(state: BuildState): readonly PlannedNeed[] {
  const found: PlannedNeed[] = [];
  for (const step of state.plan.steps) {
    const producer = resolveProducer(state.program.closure, step.producer);
    for (const need of producer.needs) {
      const binding = step.needs[need.name];
      if (binding === undefined) continue;
      found.push({
        step: step.id,
        port: need.name,
        need: binding.id,
        result: binding.result,
        capability: need.capability,
        returns: need.returns,
      });
    }
  }
  return structuredClone(found);
}

function planContent(
  steps: readonly ProducerStep[],
  goals: BuildPlan["goals"],
  outputBindings: BuildPlan["outputBindings"],
): BuildPlan {
  return {
    format: "hypit.plan@1",
    steps,
    goals,
    outputBindings,
  };
}

/** Candidate identity is useful only while the two source graphs are being planned. */
export type BuildCandidateSelection = {
  readonly output: string;
  readonly candidate: string;
  readonly record: string;
};

export type PlannedExecution = {
  readonly plan: BuildPlan;
  readonly selections: readonly BuildCandidateSelection[];
  readonly initialRecords: readonly TypedRecord[];
};

function compilePlanning(
  program: LinkedProgram,
  graph: CompiledGraph,
  request: BuildRequest,
  satisfactions: readonly Satisfaction[],
): PlannedExecution {
  verifyBuildRequest(program, graph, request);

  const selectedCandidates = new Map<string, string>();
  for (const satisfaction of satisfactions) {
    const output = resolveLogicalOutput(graph, satisfaction.output);
    const candidate = resolveCandidate(graph, satisfaction.candidate);
    invariant(
      !selectedCandidates.has(output.id),
      "DUPLICATE_RUN_SATISFACTION",
      `${output.id} is satisfied more than once`,
      output.id,
    );
    invariant(
      sameType(candidate.type, output.type),
      "CANDIDATE_RESULT_TYPE_MISMATCH",
      `${candidate.id} supplies ${typeKey(candidate.type)}, not ${typeKey(output.type)}`,
      candidate.id,
    );
    selectedCandidates.set(output.id, candidate.id);
  }

  const authored = new Map(program.records.map((record) => [record.id, record]));
  const demandedOperations = new Map<string, OperationNode>();
  const resolvedOutputs = new Map<string, ResolvedSource>();
  const selections = new Map<string, BuildCandidateSelection>();

  const operationSource = (id: string): ResolvedSource => {
    const operation = resolveOperation(graph, id);
    const producer = resolveProducer(program.closure, operation.producer);
    const type = operation.result.kind === "output"
      ? producer.outputs.find((port) => port.name === operation.result.name)?.type
      : producer.needs.find((port) => port.name === operation.result.name)?.returns;
    invariant(type !== undefined, "OPERATION_RESULT_MISMATCH", `${id} result is not declared`, id);
    return { record: operationResultRecord(operation), type };
  };

  const pending: GraphValueRef[] = request.targets.map((target) => ({
    kind: "logical-output",
    id: target.output,
  }));
  while (pending.length > 0) {
    const ref = pending.pop() as GraphValueRef;
    if (ref.kind === "record") {
      invariant(authored.has(ref.id), "UNKNOWN_RECORD", `unknown authored record ${ref.id}`, ref.id);
      continue;
    }
    if (ref.kind === "operation-result") {
      if (demandedOperations.has(ref.operation)) continue;
      const operation = resolveOperation(graph, ref.operation);
      demandedOperations.set(operation.id, operation);
      pending.push(...Object.values(operation.inputs));
      continue;
    }
    if (resolvedOutputs.has(ref.id)) continue;
    const output = resolveLogicalOutput(graph, ref.id);
    const candidate = resolveCandidate(graph, selectedCandidates.get(ref.id) ?? output.primary);
    let resolved: ResolvedSource;
    if (candidate.root.kind === "value") {
      const record: TypedRecord = {
        id: candidate.root.value.id,
        type: candidate.type,
        value: candidate.root.value.value,
      };
      invariant(!authored.has(record.id), "PROVIDED_RECORD_CONFLICT", `${record.id} conflicts with authored input`);
      resolved = { record: record.id, type: record.type };
    } else {
      resolved = operationSource(candidate.root.result.operation);
      pending.push(candidate.root.result);
    }
    invariant(
      sameType(resolved.type, output.type),
      "CANDIDATE_RESULT_TYPE_MISMATCH",
      `${candidate.id} returns ${typeKey(resolved.type)}, not ${typeKey(output.type)}`,
      candidate.id,
    );
    resolvedOutputs.set(output.id, resolved);
    selections.set(output.id, { output: output.id, candidate: candidate.id, record: resolved.record });
  }

  const resolveRef = (ref: GraphValueRef): ResolvedSource => {
    if (ref.kind === "record") {
      const record = authored.get(ref.id);
      invariant(record !== undefined, "UNKNOWN_RECORD", `unknown authored record ${ref.id}`, ref.id);
      return { record: record.id, type: record.type };
    }
    if (ref.kind === "logical-output") {
      const resolved = resolvedOutputs.get(ref.id);
      invariant(resolved !== undefined, "UNKNOWN_LOGICAL_OUTPUT", `unresolved logical output ${ref.id}`, ref.id);
      return resolved;
    }
    invariant(demandedOperations.has(ref.operation), "UNKNOWN_OPERATION", `undemanded Operation ${ref.operation}`, ref.operation);
    return operationSource(ref.operation);
  };

  const demanded = [...demandedOperations.values()].map((operation): DemandedOperation => ({
    operation,
    inputs: Object.fromEntries(
      Object.entries(operation.inputs).map(([name, ref]) => [name, resolveRef(ref).record]),
    ),
  }));
  const targetSources = request.targets.map((target) => ({
    target,
    source: resolvedOutputs.get(target.output) as ResolvedSource,
  }));

  const steps: ProducerStep[] = demanded
    .sort((a, b) => a.operation.id.localeCompare(b.operation.id))
    .map(({ operation, inputs }) => ({
      id: operation.id,
      producer: operation.producer,
      inputs,
      outputs: operation.result.kind === "output"
        ? { [operation.result.name]: operation.result.record }
        : {},
      needs: operation.result.kind === "need"
        ? {
            [operation.result.name]: {
              id: operation.result.id,
              result: operation.result.record,
            },
          }
        : {},
    }));

  const goals = targetSources
    .map(({ source }) => ({ record: source.record, type: source.type }))
    .sort((a, b) => a.record.localeCompare(b.record));
  const sortedSelections = [...selections.values()].sort((a, b) => a.output.localeCompare(b.output));
  const outputBindings = sortedSelections.map((selection) => ({
    output: selection.output,
    record: selection.record,
    type: resolveLogicalOutput(graph, selection.output).type,
  }));
  const initialRecords = selectedProvidedRecords(program, graph, sortedSelections);
  const plan = planContent(steps, goals, outputBindings);
  verifyBuildPlan(program, initialRecords, plan);
  return { plan, selections: sortedSelections, initialRecords };
}

/** Plan one Author Graph with one complete Run Graph without rewriting either graph. */
export function planBuild(
  program: LinkedProgram,
  authorGraph: CompiledGraph,
  runGraph: RunGraph,
): PlannedExecution {
  invariant(runGraph.format === "hypit.run-graph@1", "UNSUPPORTED_RUN_GRAPH", "unsupported Run Graph");
  const graph: CompiledGraph = {
    format: "hypit.graph@1",
    outputs: authorGraph.outputs,
    candidates: [...authorGraph.candidates, ...runGraph.candidates],
    operations: [...authorGraph.operations, ...runGraph.operations],
  };
  const request: BuildRequest = {
    format: "hypit.build-request@1",
    targets: runGraph.targets,
  };
  return compilePlanning(program, graph, request, runGraph.satisfactions);
}

/** Author-only planning convenience. Run compilation should call `planBuild`. */
export function compileBuild(
  program: LinkedProgram,
  graph: CompiledGraph,
  request: BuildRequest,
): BuildPlan {
  return compilePlanning(program, graph, request, []).plan;
}

export function verifyBuildPlan(
  program: LinkedProgram,
  initialRecords: readonly TypedRecord[],
  plan: BuildPlan,
): void {
  invariant(plan.format === "hypit.plan@1", "UNSUPPORTED_PLAN", "unsupported build plan format");
  invariant(plan.goals.length > 0, "EMPTY_PLAN_GOALS", "build plan has no goals");

  const records = new Map<RecordId, ProducedRecord>();
  for (const record of program.records) records.set(record.id, { type: record.type });
  for (const record of initialRecords) {
    invariant(!records.has(record.id), "DUPLICATE_RECORD", `record ${record.id} has multiple sources`, record.id);
    records.set(record.id, { type: record.type });
  }

  const stepIds = new Set<string>();
  const needIds = new Set<string>();
  for (const step of plan.steps) {
    invariant(!stepIds.has(step.id), "DUPLICATE_STEP", `duplicate step ${step.id}`, step.id);
    stepIds.add(step.id);
    const producer = resolveProducer(program.closure, step.producer);
    exactKeys(step.inputs, producer.inputs.map((port) => port.name), `${step.id}.inputs`);
    subsetKeys(step.outputs, producer.outputs.map((port) => port.name), `${step.id}.outputs`);
    subsetKeys(step.needs, producer.needs.map((port) => port.name), `${step.id}.needs`);
    invariant(
      Object.keys(step.outputs).length + Object.keys(step.needs).length === 1,
      "STEP_RESULT_NORMAL_FORM",
      `${step.id} must expose one atomic result`,
      step.id,
    );
    for (const port of producer.outputs) {
      const id = step.outputs[port.name];
      if (id === undefined) continue;
      invariant(!records.has(id), "DUPLICATE_RECORD", `record ${id} has multiple producers`, id);
      records.set(id, { type: port.type, step: step.id });
    }
    for (const port of producer.needs) {
      const binding = step.needs[port.name];
      if (binding === undefined) continue;
      invariant(!needIds.has(binding.id), "DUPLICATE_NEED", `need ${binding.id} has multiple producers`);
      needIds.add(binding.id);
      invariant(!records.has(binding.result), "DUPLICATE_RECORD", `${binding.result} has multiple producers`);
      records.set(binding.result, { type: port.returns, step: step.id });
    }
  }

  for (const step of plan.steps) {
    const producer = resolveProducer(program.closure, step.producer);
    for (const port of producer.inputs) {
      const id = step.inputs[port.name];
      const supplied = records.get(id as string);
      invariant(supplied !== undefined, "UNKNOWN_RECORD", `${step.id}.${port.name} references ${id}`, id);
      invariant(
        sameType(supplied.type, port.type),
        "INPUT_TYPE_MISMATCH",
        `${step.id}.${port.name} wants ${typeKey(port.type)} but ${String(id)} is ${typeKey(supplied.type)}`,
        id,
      );
    }
  }

  const outputIds = new Set<string>();
  for (const binding of plan.outputBindings) {
    invariant(!outputIds.has(binding.output), "DUPLICATE_OUTPUT_BINDING", `${binding.output} is bound more than once`);
    outputIds.add(binding.output);
    const record = records.get(binding.record);
    invariant(record !== undefined, "UNKNOWN_OUTPUT_RECORD", `${binding.output} binds ${binding.record}`);
    invariant(sameType(record.type, binding.type), "OUTPUT_BINDING_TYPE_MISMATCH", binding.output);
  }
  for (const goal of plan.goals) {
    const supplied = records.get(goal.record);
    invariant(supplied !== undefined, "UNKNOWN_GOAL", `goal references ${goal.record}`, goal.record);
    invariant(sameType(supplied.type, goal.type), "GOAL_TYPE_MISMATCH", goal.record);
  }
  assertAcyclic(plan, records);
  assertAllStepsReachGoal(plan, records);
}

/** Materialize selected zero-input values from their sole source of truth: the Run Graph. */
export function selectedProvidedRecords(
  program: LinkedProgram,
  graph: CompiledGraph,
  selections: readonly BuildCandidateSelection[],
): readonly TypedRecord[] {
  const authored = new Set(program.records.map((record) => record.id));
  const records = new Map<string, TypedRecord>();
  const candidates = new Map<string, string>();
  for (const selection of selections) {
    const candidate = resolveCandidate(graph, selection.candidate);
    if (candidate.root.kind !== "value") continue;
    const record: TypedRecord = {
      id: candidate.root.value.id,
      type: candidate.type,
      value: candidate.root.value.value,
    };
    invariant(selection.record === record.id, "SELECTION_RECORD_MISMATCH", `${selection.output} does not select ${record.id}`);
    invariant(!authored.has(record.id), "PROVIDED_RECORD_CONFLICT", `${record.id} conflicts with authored input`, record.id);
    const previousCandidate = candidates.get(record.id);
    invariant(
      previousCandidate === undefined || previousCandidate === candidate.id,
      "PROVIDED_RECORD_CONFLICT",
      `${record.id} is supplied by both ${previousCandidate ?? "an authored Record"} and ${candidate.id}`,
      record.id,
    );
    candidates.set(record.id, candidate.id);
    records.set(record.id, record);
  }
  return [...records.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function assertAcyclic(plan: BuildPlan, records: ReadonlyMap<RecordId, ProducedRecord>): void {
  const remaining = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const step of plan.steps) {
    remaining.set(step.id, 0);
    dependents.set(step.id, []);
  }
  for (const step of plan.steps) {
    const dependencies = new Set<string>();
    for (const input of Object.values(step.inputs)) {
      const producer = records.get(input)?.step;
      if (producer !== undefined) dependencies.add(producer);
    }
    remaining.set(step.id, dependencies.size);
    for (const dependency of dependencies) {
      (dependents.get(dependency) as string[]).push(step.id);
    }
  }
  const ready = [...remaining].filter(([, count]) => count === 0).map(([id]) => id);
  let visited = 0;
  for (let cursor = 0; cursor < ready.length; cursor += 1) {
    const id = ready[cursor] as string;
    visited += 1;
    for (const dependent of dependents.get(id) as string[]) {
      const count = (remaining.get(dependent) as number) - 1;
      remaining.set(dependent, count);
      if (count === 0) ready.push(dependent);
    }
  }
  invariant(visited === plan.steps.length, "PLAN_CYCLE", "build plan contains a producer cycle");
}

function assertAllStepsReachGoal(
  plan: BuildPlan,
  records: ReadonlyMap<RecordId, ProducedRecord>,
): void {
  const steps = new Map(plan.steps.map((step) => [step.id, step]));
  const required = new Set<string>();
  const queue = plan.goals
    .map((goal) => records.get(goal.record)?.step)
    .filter((step): step is string => step !== undefined);
  while (queue.length > 0) {
    const id = queue.pop() as string;
    if (required.has(id)) continue;
    required.add(id);
    const step = steps.get(id);
    invariant(step !== undefined, "UNKNOWN_STEP", `unknown step ${id}`, id);
    for (const input of Object.values(step.inputs)) {
      const dependency = records.get(input)?.step;
      if (dependency !== undefined) queue.push(dependency);
    }
  }
  for (const step of plan.steps) {
    invariant(required.has(step.id), "UNREACHABLE_STEP", `${step.id} does not contribute to any goal`, step.id);
  }
}

export function producerStep(plan: BuildPlan, id: string): ProducerStep {
  let index = planStepIndexes.get(plan);
  if (index === undefined) {
    index = new Map(plan.steps.map((item) => [item.id, item]));
    planStepIndexes.set(plan, index);
  }
  const step = index.get(id);
  invariant(step !== undefined, "UNKNOWN_STEP", `unknown step ${id}`, id);
  return step;
}
