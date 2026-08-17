import type {
  BuildDefinition,
  BuildFact,
  BuildPlan,
  BuildRequest,
  BuildState,
  CoreCommand,
  CompiledGraph,
  CommandResult,
  FulfillNeedCommand,
  InvokeProducerCommand,
  LinkedProgram,
  Need,
  NeedFulfilledEvent,
  ProducerCompletedEvent,
  StoredValue,
  TypedRecord,
} from "@narratage/protocol";

import { canonicalize, SvmlError } from "@narratage/protocol";
import { invariant } from "./error.js";
import { resolveProducer, verifyRecordStructure } from "./link.js";
import { compileBuild, producerStep, selectedProvidedRecords } from "./plan.js";

function commandId(kind: "producer" | "need", subject: string): string {
  return `${kind}:${subject}`;
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

function schedule(state: BuildState): BuildState {
  if (state.status !== "active" || state.outstanding.length > 0) return state;
  const records = new Set(state.records.map((record) => record.id));

  if (goalsComplete(state, records)) {
    const complete = {
      ...state,
      status: "complete" as const,
    };
    return complete;
  }

  const commands: CoreCommand[] = [];
  for (const need of state.needs) {
    if (records.has(need.result)) continue;
    commands.push({
      kind: "fulfill-need",
      id: commandId("need", need.id),
      need,
    });
  }

  for (const stepState of state.steps) {
    if (stepState.status !== "pending") continue;
    const step = producerStep(state.plan, stepState.id);
    if (!Object.values(step.inputs).every((id) => records.has(id))) {
      continue;
    }
    commands.push({
      kind: "invoke-producer",
      id: commandId("producer", step.id),
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
  const plan: BuildPlan = compileBuild(program, graph, request);
  const state: BuildState = {
    format: "narratage.build@1",
    program,
    graph,
    request,
    plan,
    status: "active",
    records: [...program.records, ...selectedProvidedRecords(program, graph, plan)],
    steps: plan.steps.map((step) => ({ id: step.id, status: "pending" })),
    needs: [],
    outstanding: [],
    diagnostics: [],
  };
  return state;
}

export function reduce(state: BuildState, event?: CommandResult): BuildState {
  const next = event === undefined ? state : applyEvent(state, event);
  return schedule(next);
}

function definitionContent(
  state: Pick<BuildState, "program" | "graph" | "request" | "plan">,
): Omit<BuildDefinition, "format"> {
  return {
    program: state.program,
    graph: state.graph,
    request: state.request,
    plan: state.plan,
  };
}

/** Compile one immutable finite Build definition. Runtime execution never changes it. */
export function defineBuild(
  program: LinkedProgram,
  graph: CompiledGraph,
  request: BuildRequest,
): BuildDefinition {
  const initial = start(program, graph, request);
  return {
    format: "narratage.build-definition@1",
    ...definitionContent(initial),
  };
}

function initialBuildView(definition: BuildDefinition): BuildState {
  return {
    format: "narratage.build@1",
    program: definition.program,
    graph: definition.graph,
    request: definition.request,
    plan: definition.plan,
    status: "active",
    records: [
      ...definition.program.records,
      ...selectedProvidedRecords(definition.program, definition.graph, definition.plan),
    ],
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
      format: "narratage.build-fact@1",
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
      format: "narratage.build-fact@1",
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
    format: "narratage.build-fact@1",
    kind: "command-failed",
    command: event.command,
    diagnostic,
  } as const;
  return { fact: content, state: next };
}

function verifyFactShape(fact: BuildFact): void {
  invariant(fact.format === "narratage.build-fact@1", "UNSUPPORTED_BUILD_FACT", fact.command, fact.command);
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
