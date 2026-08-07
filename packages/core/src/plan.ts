import type {
  BuildPlan,
  BuildRequest,
  CompiledGraph,
  Conformance,
  GraphValueRef,
  LinkedProgram,
  OperationNode,
  ProducerStep,
  RecordId,
  TypeRef,
  TypedRecord,
} from "@narratage/protocol";

import { canonicalStringify, digestOf } from "./canonical.js";
import { invariant } from "./error.js";
import {
  operationResultRecord,
  resolveLogicalOutput,
  resolveOperation,
  selectedSatisfaction,
  verifyBuildRequest,
} from "./graph.js";
import { resolveProducer, sealRecord, verifyRecord } from "./link.js";
import { sameType, typeKey } from "./reference.js";

function worst(left: Conformance, right: Conformance): Conformance {
  return left === "substitute" || right === "substitute" ? "substitute" : "exact";
}

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
  fidelity: Conformance;
};

type ProducedRecord = {
  readonly type: TypeRef;
  readonly step?: string;
};

function planContent(
  graph: CompiledGraph,
  request: BuildRequest,
  initialValues: readonly TypedRecord[],
  steps: readonly ProducerStep[],
  goals: BuildPlan["goals"],
  selections: BuildPlan["selections"],
): Omit<BuildPlan, "id"> {
  return {
    format: "svml.plan@1",
    graph: graph.id,
    request: request.digest,
    initialValues,
    steps,
    goals,
    selections,
  };
}

export function compileBuild(
  program: LinkedProgram,
  graph: CompiledGraph,
  request: BuildRequest,
): BuildPlan {
  verifyBuildRequest(program, graph, request);

  const authored = new Map(program.records.map((record) => [record.id, record]));
  const initialValues = new Map<string, TypedRecord>();
  const demanded = new Map<string, DemandedOperation>();
  const resolvedOutputs = new Map<string, ResolvedSource>();
  const resolvingOutputs = new Set<string>();
  const resolvingOperations = new Set<string>();
  const selections = new Map<string, BuildPlan["selections"][number]>();

  const resolveRef = (ref: GraphValueRef): ResolvedSource => {
    if (ref.kind === "record") {
      const record = authored.get(ref.id);
      invariant(record !== undefined, "UNKNOWN_RECORD", `unknown authored record ${ref.id}`, ref.id);
      return { record: record.id, type: record.type };
    }
    if (ref.kind === "logical-output") return resolveOutput(ref.id);
    return demandOperation(ref.operation, "exact");
  };

  const demandOperation = (id: string, fidelity: Conformance): ResolvedSource => {
    const existing = demanded.get(id);
    if (existing !== undefined) {
      existing.fidelity = worst(existing.fidelity, fidelity);
      const operation = existing.operation;
      const producer = resolveProducer(program.closure, operation.producer);
      const type = operation.result.kind === "output"
        ? producer.outputs.find((port) => port.name === operation.result.name)?.type
        : producer.needs.find((port) => port.name === operation.result.name)?.returns;
      invariant(type !== undefined, "OPERATION_RESULT_MISMATCH", `${id} result is not declared`, id);
      return { record: operationResultRecord(operation), type };
    }
    invariant(!resolvingOperations.has(id), "SELECTED_GRAPH_CYCLE", `selected graph cycles through ${id}`, id);
    resolvingOperations.add(id);
    const operation = resolveOperation(graph, id);
    const inputs = Object.fromEntries(
      Object.entries(operation.inputs).map(([name, ref]) => [name, resolveRef(ref).record]),
    );
    resolvingOperations.delete(id);
    demanded.set(id, { operation, inputs, fidelity });
    const producer = resolveProducer(program.closure, operation.producer);
    const type = operation.result.kind === "output"
      ? producer.outputs.find((port) => port.name === operation.result.name)?.type
      : producer.needs.find((port) => port.name === operation.result.name)?.returns;
    invariant(type !== undefined, "OPERATION_RESULT_MISMATCH", `${id} result is not declared`, id);
    return { record: operationResultRecord(operation), type };
  };

  const resolveOutput = (id: string): ResolvedSource => {
    const known = resolvedOutputs.get(id);
    if (known !== undefined) return known;
    invariant(!resolvingOutputs.has(id), "SELECTED_GRAPH_CYCLE", `selected graph cycles through ${id}`, id);
    resolvingOutputs.add(id);
    const output = resolveLogicalOutput(graph, id);
    const selected = selectedSatisfaction(graph, request, id);
    const { candidate, fidelity } = selected;
    let resolved: ResolvedSource;
    if (candidate.root.kind === "value") {
      const record = sealRecord({
        id: candidate.root.value.id,
        type: candidate.type,
        value: candidate.root.value.value,
        conformance: fidelity,
        origin: {
          kind: "provided",
          candidate: candidate.id,
          requestDigest: request.digest,
          ...(candidate.root.value.provenance === undefined
            ? {}
            : { provenance: candidate.root.value.provenance }),
        },
        ...(candidate.root.value.validation === undefined
          ? {}
          : { validation: candidate.root.value.validation }),
      });
      verifyRecord(program.closure, record);
      invariant(!authored.has(record.id), "PROVIDED_RECORD_CONFLICT", `${record.id} conflicts with authored input`);
      const previous = initialValues.get(record.id);
      if (previous === undefined) {
        initialValues.set(record.id, record);
      } else {
        const { conformance: _previousConformance, ...previousFact } = previous;
        const { conformance: _recordConformance, ...currentFact } = record;
        invariant(
          canonicalStringify(previousFact) === canonicalStringify(currentFact),
          "PROVIDED_RECORD_CONFLICT",
          `${record.id} has conflicting Provided Values`,
          record.id,
        );
        // One materialized fact has one plan-wide conformance. If callers need the same bytes with
        // independent path fidelity, the Run Graph must expose explicit identity projections.
        initialValues.set(record.id, { ...previous, conformance: worst(previous.conformance, fidelity) });
      }
      resolved = { record: record.id, type: record.type };
    } else {
      resolved = demandOperation(candidate.root.result.operation, fidelity);
    }
    invariant(
      sameType(resolved.type, output.type),
      "CANDIDATE_RESULT_TYPE_MISMATCH",
      `${candidate.id} returns ${typeKey(resolved.type)}, not ${typeKey(output.type)}`,
      candidate.id,
    );
    resolvingOutputs.delete(id);
    resolvedOutputs.set(id, resolved);
    selections.set(id, { output: id, candidate: candidate.id, fidelity, record: resolved.record });
    return resolved;
  };

  const targetSources = request.targets.map((target) => ({ target, source: resolveOutput(target.output) }));

  const steps: ProducerStep[] = [...demanded.values()]
    .sort((a, b) => a.operation.id.localeCompare(b.operation.id))
    .map(({ operation, inputs, fidelity }) => ({
      id: operation.id,
      producer: operation.producer,
      fidelity,
      inputs,
      outputs: operation.result.kind === "output"
        ? { [operation.result.name]: operation.result.record }
        : {},
      needs: operation.result.kind === "need"
        ? {
            [operation.result.name]: {
              id: operation.result.id,
              result: operation.result.record,
              accepts: operation.result.accepts,
            },
          }
        : {},
    }));

  const goals = targetSources
    .map(({ target, source }) => ({ record: source.record, type: source.type, accepts: target.accepts }))
    .sort((a, b) => a.record.localeCompare(b.record));
  const sortedInitial = [...initialValues.values()].sort((a, b) => a.id.localeCompare(b.id));
  const sortedSelections = [...selections.values()].sort((a, b) => a.output.localeCompare(b.output));
  const content = planContent(graph, request, sortedInitial, steps, goals, sortedSelections);
  const plan: BuildPlan = { ...content, id: digestOf(content) };
  validatePlanStructure(program, graph, request, plan);
  verifyStaticGoalConformance(program, plan);
  return plan;
}

function validatePlanStructure(
  program: LinkedProgram,
  graph: CompiledGraph,
  request: BuildRequest,
  plan: BuildPlan,
): void {
  invariant(plan.format === "svml.plan@1", "UNSUPPORTED_PLAN", "unsupported build plan format");
  invariant(plan.graph === graph.id, "PLAN_GRAPH_MISMATCH", "build plan belongs to another graph");
  invariant(plan.request === request.digest, "PLAN_REQUEST_MISMATCH", "build plan belongs to another request");
  const { id: _id, ...content } = plan;
  invariant(plan.id === digestOf(content), "PLAN_DIGEST_MISMATCH", "build plan digest differs");
  invariant(plan.goals.length > 0, "EMPTY_PLAN_GOALS", "build plan has no goals");

  const records = new Map<RecordId, ProducedRecord>();
  for (const record of program.records) records.set(record.id, { type: record.type });
  for (const record of plan.initialValues) {
    verifyRecord(program.closure, record);
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
      step.fidelity === "exact" || step.fidelity === "substitute",
      "INVALID_CONFORMANCE",
      `${step.id} fidelity is invalid`,
    );
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

  for (const selection of plan.selections) {
    const output = resolveLogicalOutput(graph, selection.output);
    const record = records.get(selection.record);
    invariant(record !== undefined, "UNKNOWN_SELECTION_RECORD", `${selection.output} selects ${selection.record}`);
    invariant(sameType(record.type, output.type), "SELECTION_TYPE_MISMATCH", selection.output);
  }
  for (const goal of plan.goals) {
    const supplied = records.get(goal.record);
    invariant(supplied !== undefined, "UNKNOWN_GOAL", `goal references ${goal.record}`, goal.record);
    invariant(sameType(supplied.type, goal.type), "GOAL_TYPE_MISMATCH", goal.record);
  }
  assertAcyclic(plan, records);
  assertAllStepsReachGoal(plan, records);
}

function verifyStaticGoalConformance(program: LinkedProgram, plan: BuildPlan): void {
  const conformances = new Map(program.records.map((record) => [record.id, record.conformance]));
  for (const record of plan.initialValues) conformances.set(record.id, record.conformance);
  const pending = new Map(plan.steps.map((step) => [step.id, step]));
  while (pending.size > 0) {
    let progressed = false;
    for (const [id, step] of pending) {
      const inputs = Object.values(step.inputs).map((record) => conformances.get(record));
      if (inputs.some((item) => item === undefined)) continue;
      const conformance = inputs.reduce<Conformance>((result, item) => worst(result, item as Conformance), step.fidelity);
      Object.values(step.outputs).forEach((record) => conformances.set(record, conformance));
      Object.values(step.needs).forEach((need) => conformances.set(need.result, conformance));
      pending.delete(id);
      progressed = true;
    }
    invariant(progressed, "PLAN_CYCLE", "build plan contains a producer cycle");
  }
  for (const goal of plan.goals) {
    invariant(
      goal.accepts === "substitute" || conformances.get(goal.record) === "exact",
      "TARGET_REJECTS_SUBSTITUTE",
      `exact Target ${goal.record} selects a substitute path`,
      goal.record,
    );
  }
}

export function validatePlan(
  program: LinkedProgram,
  graph: CompiledGraph,
  request: BuildRequest,
  plan: BuildPlan,
): void {
  const expected = compileBuild(program, graph, request);
  invariant(
    canonicalStringify(plan) === canonicalStringify(expected),
    "PLAN_NOT_DERIVED",
    "build plan is not the plan compiled from its graph and BuildRequest",
  );
}

function assertAcyclic(plan: BuildPlan, records: ReadonlyMap<RecordId, ProducedRecord>): void {
  const dependencies = new Map<string, Set<string>>();
  for (const step of plan.steps) dependencies.set(step.id, new Set());
  for (const step of plan.steps) {
    const own = dependencies.get(step.id) as Set<string>;
    for (const input of Object.values(step.inputs)) {
      const producer = records.get(input)?.step;
      if (producer !== undefined) own.add(producer);
    }
  }
  const complete = new Set<string>();
  while (complete.size < plan.steps.length) {
    const ready = [...dependencies.entries()]
      .filter(([id, required]) => !complete.has(id) && [...required].every((item) => complete.has(item)))
      .map(([id]) => id);
    invariant(ready.length > 0, "PLAN_CYCLE", "build plan contains a producer cycle");
    ready.forEach((id) => complete.add(id));
  }
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
  const step = plan.steps.find((item) => item.id === id);
  invariant(step !== undefined, "UNKNOWN_STEP", `unknown step ${id}`, id);
  return step;
}

/** @deprecated Use compileBuild. */
export const deriveBuildPlan = compileBuild;
