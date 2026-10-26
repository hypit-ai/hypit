import type {
  BuildPlan,
  BuildState,
  CapabilityRef,
  AuthorGraph,
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
import { compareCodeUnits, sameType, typeKey } from "@hypit/protocol";

import { invariant } from "./error.js";
import {
  operationResultRecord,
  resolveCandidate,
  resolveLogicalOutput,
  resolveOperation,
  verifyAuthorGraph,
} from "./graph.js";
import { resolveCapability, resolveProducer } from "./link.js";

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
    if (step.result.kind !== "need") continue;
    const producer = resolveProducer(state.program.closure, step.producer);
    const need = producer.result;
    invariant(need.kind === "need" && need.name === step.result.name, "STEP_RESULT_MISMATCH",
      `${step.id} does not request Need ${step.result.name}`, step.id);
    const returns = resolveCapability(state.program.closure, need.capability).returns;
    found.push({
      step: step.id,
      port: need.name,
      need: step.result.id,
      result: step.result.record,
      capability: need.capability,
      returns,
    });
  }
  return structuredClone(found);
}

function planContent(
  steps: readonly ProducerStep[],
  goals: BuildPlan["goals"],
): BuildPlan {
  return {
    format: "hypit.plan@1",
    steps,
    goals,
  };
}

/** Candidate identity is useful only while the two source graphs are being planned. */
export type BuildCandidateSelection = {
  readonly output: string;
  readonly candidate: string;
  readonly record: string;
};

/** One selected zero-input source whose value must be materialized before sealing a BuildDefinition. */
export type SelectedSupply = {
  readonly candidate: string;
  readonly record: string;
  readonly type: TypeRef;
};

export type PlannedExecution = {
  readonly plan: BuildPlan;
  readonly selections: readonly BuildCandidateSelection[];
  readonly selectedSupplies: readonly SelectedSupply[];
  /** Already materialized literal/value Records; selected supplies are deliberately absent. */
  readonly initialRecords: readonly TypedRecord[];
};

function compilePlanning(
  program: LinkedProgram,
  graph: AuthorGraph,
  targets: readonly string[],
  satisfactions: readonly Satisfaction[],
  runRecords: readonly TypedRecord[],
): PlannedExecution {
  const verificationProgram: LinkedProgram = {
    closure: program.closure,
    records: [...program.records, ...runRecords],
  };
  verifyAuthorGraph(verificationProgram, graph);
  const targetIds = new Set<string>();
  for (const target of targets) {
    resolveLogicalOutput(graph, target);
    invariant(!targetIds.has(target), "DUPLICATE_BUILD_TARGET", `${target} is targeted twice`);
    targetIds.add(target);
  }

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
  const availableRunRecords = new Map<string, TypedRecord>();
  for (const record of runRecords) {
    invariant(!authored.has(record.id), "RUN_RECORD_CONFLICT", `${record.id} conflicts with authored input`, record.id);
    invariant(!availableRunRecords.has(record.id), "DUPLICATE_RUN_RECORD", `${record.id} is declared twice`, record.id);
    availableRunRecords.set(record.id, record);
    authored.set(record.id, record);
  }
  const demandedRunRecords = new Set<string>();
  const demandedOperations = new Map<string, OperationNode>();
  const resolvedOutputs = new Map<string, ResolvedSource>();
  const selections = new Map<string, BuildCandidateSelection>();
  const selectedSupplies = new Map<string, SelectedSupply>();
  const supplyRecords = new Map<string, string>();

  const operationSource = (id: string): ResolvedSource => {
    const operation = resolveOperation(graph, id);
    const producer = resolveProducer(program.closure, operation.producer);
    const result = producer.result;
    const type = operation.result.kind === "output" && result.kind === "output"
      && result.name === operation.result.name
      ? result.type
      : operation.result.kind === "need" && result.kind === "need"
        && result.name === operation.result.name
        ? resolveCapability(program.closure, result.capability).returns
        : undefined;
    invariant(type !== undefined, "OPERATION_RESULT_MISMATCH", `${id} result is not declared`, id);
    return { record: operationResultRecord(operation), type };
  };

  const pending: GraphValueRef[] = targets.map((target) => ({
    kind: "logical-output",
    id: target,
  }));
  while (pending.length > 0) {
    const ref = pending.pop() as GraphValueRef;
    if (ref.kind === "record") {
      invariant(authored.has(ref.id), "UNKNOWN_RECORD", `unknown authored record ${ref.id}`, ref.id);
      if (availableRunRecords.has(ref.id)) demandedRunRecords.add(ref.id);
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
        id: candidate.root.record,
        type: candidate.type,
        value: candidate.root.value,
      };
      invariant(!authored.has(record.id), "CANDIDATE_RECORD_CONFLICT", `${record.id} conflicts with authored input`);
      resolved = { record: record.id, type: record.type };
    } else if (candidate.root.kind === "supply") {
      invariant(!authored.has(candidate.root.record), "CANDIDATE_RECORD_CONFLICT",
        `${candidate.root.record} conflicts with authored input`, candidate.root.record);
      const previousCandidate = supplyRecords.get(candidate.root.record);
      invariant(
        previousCandidate === undefined || previousCandidate === candidate.id,
        "CANDIDATE_RECORD_CONFLICT",
        `${candidate.root.record} is supplied by both ${previousCandidate ?? "an authored Record"} and ${candidate.id}`,
        candidate.root.record,
      );
      supplyRecords.set(candidate.root.record, candidate.id);
      selectedSupplies.set(candidate.id, {
        candidate: candidate.id,
        record: candidate.root.record,
        type: candidate.type,
      });
      resolved = { record: candidate.root.record, type: candidate.type };
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
  const targetSources = targets.map((target) => ({
    target,
    source: resolvedOutputs.get(target) as ResolvedSource,
  }));

  const steps: ProducerStep[] = demanded
    .sort((a, b) => compareCodeUnits(a.operation.id, b.operation.id))
    .map(({ operation, inputs }) => ({
      id: operation.id,
      producer: operation.producer,
      inputs,
      result: operation.result,
    }));

  const goals = [...new Set(targetSources.map(({ source }) => source.record))].sort();
  const sortedSelections = [...selections.values()].sort((a, b) => compareCodeUnits(a.output, b.output));
  const initialRecordsById = new Map<string, TypedRecord>();
  for (const record of selectedValueRecords(program, graph, sortedSelections)) {
    initialRecordsById.set(record.id, record);
  }
  for (const id of demandedRunRecords) {
    const record = availableRunRecords.get(id)!;
    invariant(!initialRecordsById.has(id), "RUN_RECORD_CONFLICT", `${id} has multiple sources`, id);
    initialRecordsById.set(id, record);
  }
  const initialRecords = [...initialRecordsById.values()].sort((left, right) => compareCodeUnits(left.id, right.id));
  const plan = planContent(steps, goals);
  const sortedSupplies = [...selectedSupplies.values()].sort((left, right) => compareCodeUnits(left.candidate, right.candidate));
  verifyBuildPlan(program, [
    ...initialRecords,
    ...sortedSupplies.map((supply) => ({ id: supply.record, type: supply.type })),
  ], plan);
  return { plan, selections: sortedSelections, selectedSupplies: sortedSupplies, initialRecords };
}

/** Plan one Author Graph with one complete Run Graph without rewriting either graph. */
export function planBuild(
  program: LinkedProgram,
  authorGraph: AuthorGraph,
  runGraph: RunGraph,
): PlannedExecution {
  invariant(runGraph.format === "hypit.run-graph@1", "UNSUPPORTED_RUN_GRAPH", "unsupported Run Graph");
  const graph: AuthorGraph = {
    format: "hypit.graph@1",
    outputs: authorGraph.outputs,
    candidates: [...authorGraph.candidates, ...runGraph.candidates],
    operations: [...authorGraph.operations, ...runGraph.operations],
  };
  return compilePlanning(program, graph, runGraph.targets, runGraph.satisfactions, runGraph.records);
}

export function verifyBuildPlan(
  program: LinkedProgram,
  initialRecords: readonly Pick<TypedRecord, "id" | "type">[],
  plan: BuildPlan,
): void {
  invariant(plan.format === "hypit.plan@1", "UNSUPPORTED_PLAN", "unsupported build plan format");

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
    if (step.result.kind === "output") {
      const port = producer.result;
      invariant(port.kind === "output" && port.name === step.result.name, "STEP_RESULT_MISMATCH",
        `${step.id} does not produce output ${step.result.name}`, step.id);
      invariant(!records.has(step.result.record), "DUPLICATE_RECORD",
        `record ${step.result.record} has multiple producers`, step.result.record);
      records.set(step.result.record, { type: port.type, step: step.id });
    } else {
      const port = producer.result;
      invariant(port.kind === "need" && port.name === step.result.name, "STEP_RESULT_MISMATCH",
        `${step.id} does not request Need ${step.result.name}`, step.id);
      invariant(!needIds.has(step.result.id), "DUPLICATE_NEED", `need ${step.result.id} has multiple producers`);
      needIds.add(step.result.id);
      invariant(!records.has(step.result.record), "DUPLICATE_RECORD", `${step.result.record} has multiple producers`);
      records.set(step.result.record, {
        type: resolveCapability(program.closure, port.capability).returns,
        step: step.id,
      });
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

  const goals = new Set<string>();
  for (const goal of plan.goals) {
    invariant(!goals.has(goal), "DUPLICATE_GOAL", `goal references ${goal} more than once`, goal);
    goals.add(goal);
    invariant(records.has(goal), "UNKNOWN_GOAL", `goal references ${goal}`, goal);
  }
  assertAcyclic(plan, records);
  assertAllStepsReachGoal(plan, records);
}

/** Materialize selected zero-input values from their sole source of truth: the Run Graph. */
export function selectedValueRecords(
  program: LinkedProgram,
  graph: AuthorGraph,
  selections: readonly BuildCandidateSelection[],
): readonly TypedRecord[] {
  const authored = new Set(program.records.map((record) => record.id));
  const records = new Map<string, TypedRecord>();
  const candidates = new Map<string, string>();
  for (const selection of selections) {
    const candidate = resolveCandidate(graph, selection.candidate);
    if (candidate.root.kind !== "value") continue;
    const record: TypedRecord = {
      id: candidate.root.record,
      type: candidate.type,
      value: candidate.root.value,
    };
    invariant(selection.record === record.id, "SELECTION_RECORD_MISMATCH", `${selection.output} does not select ${record.id}`);
    invariant(!authored.has(record.id), "CANDIDATE_RECORD_CONFLICT", `${record.id} conflicts with authored input`, record.id);
    const previousCandidate = candidates.get(record.id);
    invariant(
      previousCandidate === undefined || previousCandidate === candidate.id,
      "CANDIDATE_RECORD_CONFLICT",
      `${record.id} is supplied by both ${previousCandidate ?? "an authored Record"} and ${candidate.id}`,
      record.id,
    );
    candidates.set(record.id, candidate.id);
    records.set(record.id, record);
  }
  return [...records.values()].sort((left, right) => compareCodeUnits(left.id, right.id));
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
    .map((goal) => records.get(goal)?.step)
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
