import type {
  BuildPlan,
  LinkedProgram,
  ProducerStep,
  RecordId,
  TypeRef,
} from "@svml/protocol";

import { invariant } from "./error.js";
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

type ProducedRecord = {
  readonly type: TypeRef;
  readonly step?: string;
};

export function validatePlan(program: LinkedProgram, plan: BuildPlan): void {
  invariant(plan.format === "svml.plan@0", "UNSUPPORTED_PLAN", "unsupported build plan format");
  invariant(plan.id.length > 0, "EMPTY_PLAN_ID", "build plan id is empty");
  invariant(plan.goals.length > 0, "EMPTY_PLAN_GOALS", "build plan has no goals");

  const records = new Map<RecordId, ProducedRecord>();
  for (const record of program.records) records.set(record.id, { type: record.type });

  const stepIds = new Set<string>();
  const needIds = new Set<string>();
  for (const step of plan.steps) {
    invariant(!stepIds.has(step.id), "DUPLICATE_STEP", `duplicate step ${step.id}`, step.id);
    stepIds.add(step.id);
    const producer = resolveProducer(program.closure, step.producer);
    exactKeys(step.inputs, producer.inputs.map((port) => port.name), `${step.id}.inputs`);
    exactKeys(step.outputs, producer.outputs.map((port) => port.name), `${step.id}.outputs`);
    exactKeys(step.needs, producer.needs.map((port) => port.name), `${step.id}.needs`);

    for (const port of producer.outputs) {
      const id = step.outputs[port.name];
      invariant(id !== undefined && id.length > 0, "EMPTY_RECORD_ID", `${step.id}.${port.name} is empty`);
      invariant(!records.has(id), "DUPLICATE_RECORD", `record ${id} has multiple producers`, id);
      records.set(id, { type: port.type, step: step.id });
    }
    for (const port of producer.needs) {
      const binding = step.needs[port.name];
      invariant(binding !== undefined, "MISSING_NEED_BINDING", `${step.id}.${port.name} is not bound`);
      invariant(binding.id.length > 0, "EMPTY_NEED_ID", `${step.id}.${port.name} need id is empty`);
      invariant(!needIds.has(binding.id), "DUPLICATE_NEED", `need ${binding.id} has multiple producers`);
      needIds.add(binding.id);
      invariant(binding.result.length > 0, "EMPTY_RECORD_ID", `${step.id}.${port.name} result id is empty`);
      invariant(
        !records.has(binding.result),
        "DUPLICATE_RECORD",
        `record ${binding.result} has multiple producers`,
        binding.result,
      );
      records.set(binding.result, { type: port.wants, step: step.id });
    }
  }

  for (const step of plan.steps) {
    const producer = resolveProducer(program.closure, step.producer);
    for (const port of producer.inputs) {
      const id = step.inputs[port.name];
      invariant(id !== undefined, "MISSING_INPUT_BINDING", `${step.id}.${port.name} is not bound`);
      const supplied = records.get(id);
      invariant(supplied !== undefined, "UNKNOWN_RECORD", `${step.id}.${port.name} references ${id}`, id);
      invariant(
        sameType(supplied.type, port.type),
        "INPUT_TYPE_MISMATCH",
        `${step.id}.${port.name} wants ${typeKey(port.type)} but ${id} is ${typeKey(supplied.type)}`,
        id,
      );
    }
  }

  for (const goal of plan.goals) {
    const supplied = records.get(goal.record);
    invariant(supplied !== undefined, "UNKNOWN_GOAL", `goal references ${goal.record}`, goal.record);
    invariant(
      sameType(supplied.type, goal.type),
      "GOAL_TYPE_MISMATCH",
      `goal wants ${typeKey(goal.type)} but ${goal.record} is ${typeKey(supplied.type)}`,
      goal.record,
    );
  }

  assertAcyclic(plan, records);
  assertAllStepsReachGoal(plan, records);
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
    invariant(
      required.has(step.id),
      "UNREACHABLE_STEP",
      `${step.id} does not contribute to any build goal`,
      step.id,
    );
  }
}

export function producerStep(plan: BuildPlan, id: string): ProducerStep {
  const step = plan.steps.find((item) => item.id === id);
  invariant(step !== undefined, "UNKNOWN_STEP", `unknown step ${id}`, id);
  return step;
}
