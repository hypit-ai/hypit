import type {
  BuildDefinition,
  BuildFact,
  BuildRequest,
  BuildState,
  CoreCommand,
  CompiledGraph,
  CommandResult,
  CommandId,
  FulfillNeedCommand,
  InvokeProducerCommand,
  LinkedProgram,
  Need,
  NeedFulfilledEvent,
  ProducerCompletedEvent,
  StoredValue,
  TypedRecord,
} from "@hypit/protocol";

import { canonicalize, SvmlError } from "@hypit/protocol";
import { invariant } from "./error.js";
import { resolveProducer, verifyRecordStructure } from "./link.js";
import { planBuild, producerStep, verifyBuildPlan } from "./plan.js";

function commandId(kind: "producer" | "need", subject: string): string {
  return `${kind}:${subject}`;
}

function needCommand(need: Need): FulfillNeedCommand {
  return { kind: "fulfill-need", id: commandId("need", need.id), need };
}

/** Resolve an issued Need's Command even after the Build has stopped scheduling work. */
export function resolveNeedCommand(state: BuildState, id: CommandId): FulfillNeedCommand | undefined {
  const need = state.needs.find((item) => needCommand(item).id === id);
  return need === undefined ? undefined : needCommand(need);
}

function withoutCommand(state: BuildState, id: string): readonly CoreCommand[] {
  return state.outstanding.filter((command) => command.id !== id);
}

function normalizeStoredValue(value: StoredValue): StoredValue {
  if (value.kind === "inline") {
    return { kind: "inline", value: canonicalize(value.value) };
  }
  invariant(Number.isSafeInteger(value.size) && value.size >= 0, "INVALID_BLOB", "blob size is invalid");
  return { ...value };
}

function exactPortKeys(
  actual: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  subject: string,
): void {
  const left = Object.keys(actual).sort();
  const right = [...expected].sort();
  invariant(
    JSON.stringify(left) === JSON.stringify(right),
    "PRODUCER_RESULT_PORT_MISMATCH",
    `${subject} returned [${left.join(", ")}] but must return [${right.join(", ")}]`,
    subject,
  );
}

function acceptProducerEvent(
  state: BuildState,
  command: InvokeProducerCommand,
  event: ProducerCompletedEvent,
): BuildState {
  const step = producerStep(state.plan, command.step);
  const stepState = state.steps.find((item) => item.id === step.id);
  invariant(stepState?.status === "pending", "STEP_ALREADY_COMPLETE", `${step.id} is already complete`, step.id);
  const producer = resolveProducer(state.program.closure, step.producer);
  exactPortKeys(event.outputs, producer.outputs.map((port) => port.name), `${step.id}.outputs`);
  exactPortKeys(event.needs, producer.needs.map((port) => port.name), `${step.id}.needs`);

  const outputs: TypedRecord[] = producer.outputs
    .filter((port) => step.outputs[port.name] !== undefined)
    .map((port) => {
    const id = step.outputs[port.name];
    const rawValue = event.outputs[port.name];
    invariant(id !== undefined, "MISSING_OUTPUT_BINDING", `${step.id}.${port.name} is not bound`);
    invariant(rawValue !== undefined, "MISSING_OUTPUT_VALUE", `${step.id}.${port.name} returned no value`);
    const value = normalizeStoredValue(rawValue);
    return {
      id,
      type: port.type,
      value,
    };
  });

  const needs: Need[] = producer.needs
    .filter((port) => step.needs[port.name] !== undefined)
    .map((port) => {
    const binding = step.needs[port.name];
    const constraints = event.needs[port.name];
    invariant(binding !== undefined, "MISSING_NEED_BINDING", `${step.id}.${port.name} is not bound`);
    invariant(constraints !== undefined, "MISSING_NEED_VALUE", `${step.id}.${port.name} returned no constraints`);
    const normalized = canonicalize(constraints);
    const request = {
      capability: port.capability,
      returns: port.returns,
      constraints: normalized,
      result: binding.result,
    } as const;
    return {
      id: binding.id,
      ...request,
    };
  });
  outputs.forEach((record) => verifyRecordStructure(state.program.closure, record));

  return {
    ...state,
    records: [...state.records, ...outputs],
    needs: [...state.needs, ...needs],
    steps: state.steps.map((item) =>
      item.id === step.id ? { id: item.id, status: "complete" } : item,
    ),
    outstanding: withoutCommand(state, command.id),
  };
}

function acceptNeedEvent(
  state: BuildState,
  command: FulfillNeedCommand,
  event: NeedFulfilledEvent,
): BuildState {
  const need = state.needs.find((item) => item.id === command.need.id);
  invariant(need !== undefined, "UNKNOWN_NEED", `unknown need ${command.need.id}`, command.need.id);
  invariant(
    !state.records.some((record) => record.id === need.result),
    "NEED_ALREADY_FULFILLED",
    `${need.id} is already fulfilled`,
    need.id,
  );
  const value = normalizeStoredValue(event.value);
  const record: TypedRecord = {
    id: need.result,
    type: need.returns,
    value,
  };
  verifyRecordStructure(state.program.closure, record);

  return {
    ...state,
    records: [...state.records, record],
    outstanding: withoutCommand(state, command.id),
  };
}

function acceptFailure(
  state: BuildState,
  event: CommandResult & { kind: "command-failed" },
): BuildState {
  return {
    ...state,
    status: "failed",
    outstanding: [],
    diagnostics: [
      ...state.diagnostics,
      { code: event.code, message: event.message, subject: event.command },
    ],
  };
}

function applyEvent(state: BuildState, event: CommandResult): BuildState {
  const command = state.outstanding.find((item) => item.id === event.command);
  invariant(command !== undefined, "UNKNOWN_COMMAND", `event references ${event.command}`, event.command);

  if (event.kind === "command-failed") return acceptFailure(state, event);
  if (command.kind === "invoke-producer" && event.kind === "producer-completed") {
    return acceptProducerEvent(state, command, event);
  }
  if (command.kind === "fulfill-need" && event.kind === "need-fulfilled") {
    return acceptNeedEvent(state, command, event);
  }
  throw new SvmlError(
    "EVENT_COMMAND_MISMATCH",
    `${event.kind} cannot complete ${command.kind}`,
    command.id,
  );
}

function goalsComplete(state: BuildState, records: ReadonlySet<string>): boolean {
  return state.plan.goals.every((goal) => records.has(goal.record));
}

/**
 * Every command that can run now is outstanding: the ones already issued, plus every Need whose
 * result is missing and every pending step whose inputs exist. Scheduling is incremental, so a
 * cheap Producer never waits behind an unrelated external request that happens to share a turn.
 */
function schedule(state: BuildState): BuildState {
  if (state.status !== "active") return state;
  const records = new Set(state.records.map((record) => record.id));

  if (goalsComplete(state, records)) {
    const complete = {
      ...state,
      status: "complete" as const,
      outstanding: [],
    };
    return complete;
  }

  const issued = new Set(state.outstanding.map((command) => command.id));
  const commands: CoreCommand[] = [...state.outstanding];
  for (const need of state.needs) {
    if (records.has(need.result)) continue;
    const command = needCommand(need);
    if (issued.has(command.id)) continue;
    commands.push(command);
  }

  for (const stepState of state.steps) {
    if (stepState.status !== "pending") continue;
    const step = producerStep(state.plan, stepState.id);
    if (!Object.values(step.inputs).every((id) => records.has(id))) {
      continue;
    }
    const id = commandId("producer", step.id);
    if (issued.has(id)) continue;
    commands.push({
      kind: "invoke-producer",
      id,
      step: step.id,
      producer: step.producer,
      inputs: step.inputs,
    });
  }

  commands.sort((left, right) => left.id.localeCompare(right.id));
  if (commands.length === 0) {
    const failed: BuildState = {
      ...state,
      status: "failed",
      diagnostics: [
        ...state.diagnostics,
        {
          code: "BUILD_DEADLOCK",
          message: "no command can make progress toward the requested goals",
        },
      ],
    };
    return failed;
  }

  const scheduled: BuildState = { ...state, outstanding: commands };
  return scheduled;
}

export function start(
  program: LinkedProgram,
  graph: CompiledGraph,
  request: BuildRequest,
): BuildState {
  const planned = planBuild(program, graph, {
    format: "hypit.run-graph@1",
    records: [],
    candidates: [],
    operations: [],
    satisfactions: [],
    targets: request.targets,
  });
  return initialBuildView(defineBuild({
    program,
    initialRecords: planned.initialRecords,
    plan: planned.plan,
    targets: request.targets,
  }));
}

export function reduce(state: BuildState, event?: CommandResult): BuildState {
  const next = event === undefined ? state : applyEvent(state, event);
  return schedule(next);
}

/** Seal one already selected execution. Graphs and Candidates do not cross this boundary. */
export function defineBuild(
  input: Omit<BuildDefinition, "format">,
): BuildDefinition {
  verifyBuildPlan(input.program, input.initialRecords, input.plan);
  invariant(input.targets.length > 0, "EMPTY_BUILD_TARGETS", "Build has no Targets");
  const bindings = new Set(input.plan.outputBindings.map((binding) => binding.output));
  const targets = new Set<string>();
  for (const target of input.targets) {
    invariant(bindings.has(target.output), "UNKNOWN_BUILD_TARGET", `${target.output} has no Output binding`, target.output);
    invariant(!targets.has(target.output), "DUPLICATE_BUILD_TARGET", `${target.output} is targeted twice`, target.output);
    targets.add(target.output);
  }
  return { format: "hypit.build-definition@1", ...input };
}

function initialBuildView(definition: BuildDefinition): BuildState {
  invariant(definition.format === "hypit.build-definition@1", "UNSUPPORTED_BUILD_DEFINITION", definition.format);
  verifyBuildPlan(definition.program, definition.initialRecords, definition.plan);
  return {
    format: "hypit.build@1",
    program: definition.program,
    plan: definition.plan,
    targets: definition.targets,
    status: "active",
    records: [...definition.program.records, ...definition.initialRecords],
    steps: definition.plan.steps.map((step) => ({ id: step.id, status: "pending" })),
    needs: [],
    outstanding: [],
    diagnostics: [],
  };
}

/**
 * Admit one untrusted Command result and return the fixed Core Fact it establishes.
 * The returned next view is provisional until the Store durably appends `fact`.
 */
export function admitBuildResult(
  state: BuildState,
  event: CommandResult,
): { readonly fact: BuildFact; readonly state: BuildState } {
  const next = reduce(state, event);

  if (event.kind === "producer-completed") {
    const command = state.outstanding.find((item) => item.id === event.command);
    invariant(command?.kind === "invoke-producer", "EVENT_COMMAND_MISMATCH", event.command, event.command);
    const content = {
      format: "hypit.build-fact@1",
      kind: "producer-applied",
      command: event.command,
      step: command.step,
      records: next.records.slice(state.records.length),
      needs: next.needs.slice(state.needs.length),
    } as const;
    return { fact: content, state: next };
  }
  if (event.kind === "need-fulfilled") {
    const command = state.outstanding.find((item) => item.id === event.command);
    invariant(command?.kind === "fulfill-need", "EVENT_COMMAND_MISMATCH", event.command, event.command);
    const record = next.records.at(-1);
    invariant(record?.id === command.need.result, "NEED_RECORD_MISSING", command.need.id, command.need.id);
    const content = {
      format: "hypit.build-fact@1",
      kind: "need-applied",
      command: event.command,
      need: command.need.id,
      record,
    } as const;
    return { fact: content, state: next };
  }
  const diagnostic = next.diagnostics.at(-1);
  invariant(diagnostic?.subject === event.command, "FAILURE_DIAGNOSTIC_MISSING", event.command, event.command);
  const content = {
    format: "hypit.build-fact@1",
    kind: "command-failed",
    command: event.command,
    diagnostic,
  } as const;
  return { fact: content, state: next };
}

function verifyFactShape(fact: BuildFact): void {
  invariant(fact.format === "hypit.build-fact@1", "UNSUPPORTED_BUILD_FACT", fact.command, fact.command);
}

/** Reconstruct the materialized view from one immutable Definition and its accepted Facts. */
export function materializeBuild(
  definition: BuildDefinition,
  facts: readonly BuildFact[],
): BuildState {
  const initial = initialBuildView(definition);
  const records = [...initial.records];
  const steps = [...initial.steps];
  const needs: Need[] = [];
  const diagnostics: BuildState["diagnostics"][number][] = [];
  const stepIndexes = new Map(steps.map((step, index) => [step.id, index]));
  const recordIds = new Set(records.map((record) => record.id));
  const needIds = new Set<string>();
  let status: BuildState["status"] = "active";

  for (const fact of facts) {
    verifyFactShape(fact);
    invariant(status === "active", "FACT_AFTER_TERMINAL", fact.command, fact.command);

    if (fact.kind === "producer-applied") {
      const stepIndex = stepIndexes.get(fact.step);
      invariant(stepIndex !== undefined, "UNKNOWN_STEP", fact.step, fact.step);
      const step = steps[stepIndex];
      invariant(step?.status === "pending", "STEP_ALREADY_COMPLETE", fact.step, fact.step);
      const planned = producerStep(definition.plan, fact.step);
      invariant(
        Object.values(planned.inputs).every((record) => recordIds.has(record)),
        "FACT_INPUT_NOT_READY",
        fact.step,
        fact.step,
      );
      for (const record of fact.records) {
        invariant(!recordIds.has(record.id), "DUPLICATE_RECORD", record.id, record.id);
        recordIds.add(record.id);
        records.push(record);
      }
      for (const need of fact.needs) {
        invariant(!needIds.has(need.id), "DUPLICATE_NEED", need.id, need.id);
        needIds.add(need.id);
        needs.push(need);
      }
      steps[stepIndex] = { id: fact.step, status: "complete" };
      continue;
    }
    if (fact.kind === "need-applied") {
      invariant(needIds.has(fact.need), "UNKNOWN_NEED", fact.need, fact.need);
      invariant(!recordIds.has(fact.record.id), "NEED_ALREADY_FULFILLED", fact.need, fact.need);
      recordIds.add(fact.record.id);
      records.push(fact.record);
      continue;
    }
    diagnostics.push(fact.diagnostic);
    status = "failed";
  }

  return schedule({
    ...initial,
    status,
    records,
    steps,
    needs,
    diagnostics,
  });
}
