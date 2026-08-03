import type {
  BuildEvent,
  BuildPlan,
  BuildState,
  CanonicalValue,
  Conformance,
  CoreCommand,
  CoreTransition,
  Derivation,
  FulfillNeedCommand,
  InvokeProducerCommand,
  LinkedProgram,
  Need,
  NeedFulfilledEvent,
  ProducerCompletedEvent,
  Receipt,
  StoredValue,
  TypedRecord,
} from "@svml/protocol";

import { canonicalize, digestOf, recordDigest } from "./canonical.js";
import { CoreError, invariant } from "./error.js";
import { resolveProducer, resolveType, sealRecord } from "./link.js";
import { producerStep, validatePlan } from "./plan.js";
import { producerKey } from "./reference.js";
import { validateStoredValue } from "./schema.js";
import { verifyBuildState } from "./verify.js";

function commandId(build: string, kind: string, subject: string): string {
  return `command:${digestOf({ build, kind, subject })}`;
}

function eventDigest(event: BuildEvent): ReturnType<typeof digestOf> {
  return digestOf(event);
}

function withoutCommand(state: BuildState, id: string): readonly CoreCommand[] {
  return state.outstanding.filter((command) => command.id !== id);
}

function addAcceptedEvent(state: BuildState, event: BuildEvent): BuildState["acceptedEvents"] {
  return [...state.acceptedEvents, { id: event.id, digest: eventDigest(event) }];
}

function inheritedConformance(records: readonly TypedRecord[]): Conformance {
  return records.some((record) => record.conformance === "substitute") ? "substitute" : "exact";
}

function inputRecords(state: BuildState, command: InvokeProducerCommand): TypedRecord[] {
  return Object.values(command.inputs).map((id) => {
    const record = state.records.find((item) => item.id === id);
    invariant(record !== undefined, "MISSING_INPUT", `${command.step} input ${id} is missing`, id);
    return record;
  });
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

  const inputs = inputRecords(state, command);
  const conformance = inheritedConformance(inputs);
  const derivationId = `derivation:${digestOf({
    build: state.id,
    command: command.id,
    event: eventDigest(event),
    inputs: inputs.map((record) => ({ id: record.id, digest: record.digest })),
  })}`;

  const outputs: TypedRecord[] = producer.outputs.map((port) => {
    const id = step.outputs[port.name];
    const rawValue = event.outputs[port.name];
    invariant(id !== undefined, "MISSING_OUTPUT_BINDING", `${step.id}.${port.name} is not bound`);
    invariant(rawValue !== undefined, "MISSING_OUTPUT_VALUE", `${step.id}.${port.name} returned no value`);
    const value = normalizeStoredValue(rawValue);
    validateStoredValue(value, resolveType(state.program.closure, port.type).schema, `$output.${step.id}.${port.name}`);
    return sealRecord({
      id,
      type: port.type,
      value,
      conformance,
      origin: { kind: "derived", derivation: derivationId },
    });
  });

  const needs: Need[] = producer.needs.map((port) => {
    const binding = step.needs[port.name];
    const constraints = event.needs[port.name];
    invariant(binding !== undefined, "MISSING_NEED_BINDING", `${step.id}.${port.name} is not bound`);
    invariant(constraints !== undefined, "MISSING_NEED_VALUE", `${step.id}.${port.name} returned no constraints`);
    const normalized = canonicalize(constraints);
    const requestDigest = digestOf({
      wants: port.wants,
      constraints: normalized,
      requestedBy: derivationId,
      result: binding.result,
      accepts: binding.accepts,
    });
    return {
      id: binding.id,
      wants: port.wants,
      constraints: normalized,
      requestedBy: derivationId,
      result: binding.result,
      accepts: binding.accepts,
      requestDigest,
    };
  });

  const derivation: Derivation = {
    id: derivationId,
    step: step.id,
    producer: step.producer,
    implementationDigest: producer.implementation.digest,
    inputs: inputs.map((record) => record.id),
    outputs: outputs.map((record) => record.id),
    needs: needs.map((need) => need.id),
  };

  return {
    ...state,
    records: [...state.records, ...outputs],
    needs: [...state.needs, ...needs],
    derivations: [...state.derivations, derivation],
    steps: state.steps.map((item) =>
      item.id === step.id ? { id: item.id, status: "complete", derivation: derivationId } : item,
    ),
    outstanding: withoutCommand(state, command.id),
    acceptedEvents: addAcceptedEvent(state, event),
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
  invariant(
    event.requestDigest === need.requestDigest,
    "REQUEST_DIGEST_MISMATCH",
    `${need.id} fulfillment is for another request`,
    need.id,
  );
  invariant(
    need.accepts === "substitute" || event.conformance === "exact",
    "SUBSTITUTE_NOT_ACCEPTED",
    `${need.id} requires exact fulfillment`,
    need.id,
  );

  const value = normalizeStoredValue(event.value);
  validateStoredValue(value, resolveType(state.program.closure, need.wants).schema, `$need.${need.id}`);
  const outputDigest = recordDigest(need.wants, value);
  const metadata = canonicalize(event.metadata);
  const receiptId = `receipt:${digestOf({
    need: need.id,
    requestDigest: event.requestDigest,
    fulfiller: event.fulfiller,
    conformance: event.conformance,
    delivery: event.delivery,
    output: need.result,
    outputDigest,
    metadata,
  })}`;
  const receipt: Receipt = {
    id: receiptId,
    need: need.id,
    requestDigest: need.requestDigest,
    fulfiller: event.fulfiller,
    conformance: event.conformance,
    delivery: event.delivery,
    output: need.result,
    outputDigest,
    metadata,
  };
  const record: TypedRecord = {
    id: need.result,
    type: need.wants,
    value,
    digest: outputDigest,
    conformance: event.conformance,
    origin: { kind: "observed", receipt: receipt.id },
  };

  return {
    ...state,
    records: [...state.records, record],
    receipts: [...state.receipts, receipt],
    outstanding: withoutCommand(state, command.id),
    acceptedEvents: addAcceptedEvent(state, event),
  };
}

function acceptFailure(state: BuildState, event: BuildEvent & { kind: "command-failed" }): BuildState {
  return {
    ...state,
    status: "failed",
    outstanding: [],
    acceptedEvents: addAcceptedEvent(state, event),
    diagnostics: [
      ...state.diagnostics,
      { code: event.code, message: event.message, subject: event.command },
    ],
  };
}

function applyEvent(state: BuildState, event: BuildEvent): BuildState {
  invariant(event.id.length > 0, "EMPTY_EVENT_ID", "event id is empty");
  const accepted = state.acceptedEvents.find((item) => item.id === event.id);
  if (accepted !== undefined) {
    invariant(
      accepted.digest === eventDigest(event),
      "EVENT_ID_REUSED",
      `${event.id} was already accepted with different content`,
      event.id,
    );
    return state;
  }

  const command = state.outstanding.find((item) => item.id === event.command);
  invariant(command !== undefined, "UNKNOWN_COMMAND", `event references ${event.command}`, event.command);

  if (event.kind === "command-failed") return acceptFailure(state, event);
  if (command.kind === "invoke-producer" && event.kind === "producer-completed") {
    return acceptProducerEvent(state, command, event);
  }
  if (command.kind === "fulfill-need" && event.kind === "need-fulfilled") {
    return acceptNeedEvent(state, command, event);
  }
  throw new CoreError(
    "EVENT_COMMAND_MISMATCH",
    `${event.kind} cannot complete ${command.kind}`,
    command.id,
  );
}

function goalsComplete(state: BuildState): boolean {
  return state.plan.goals.every((goal) => {
    const record = state.records.find((item) => item.id === goal.record);
    if (record === undefined) return false;
    return goal.accepts === "substitute" || record.conformance === "exact";
  });
}

function schedule(state: BuildState): CoreTransition {
  if (state.status !== "active") return { state, commands: [] };
  if (state.outstanding.length > 0) return { state, commands: state.outstanding };

  if (goalsComplete(state)) {
    const complete = {
      ...state,
      status: "complete" as const,
    };
    return {
      state: complete,
      commands: [
        {
          kind: "complete",
          id: commandId(state.id, "complete", state.plan.id),
          goals: state.plan.goals.map((goal) => goal.record),
        },
      ],
    };
  }

  const commands: CoreCommand[] = [];
  for (const need of state.needs) {
    if (state.records.some((record) => record.id === need.result)) continue;
    commands.push({
      kind: "fulfill-need",
      id: commandId(state.id, "need", need.id),
      need,
    });
  }

  for (const stepState of state.steps) {
    if (stepState.status !== "pending") continue;
    const step = producerStep(state.plan, stepState.id);
    if (!Object.values(step.inputs).every((id) => state.records.some((record) => record.id === id))) {
      continue;
    }
    commands.push({
      kind: "invoke-producer",
      id: commandId(state.id, "producer", step.id),
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
    return { state: failed, commands: [] };
  }

  const scheduled: BuildState = { ...state, outstanding: commands };
  return { state: scheduled, commands };
}

export function start(program: LinkedProgram, plan: BuildPlan): BuildState {
  validatePlan(program, plan);
  const state: BuildState = {
    format: "svml.build@0",
    id: digestOf({
      closure: program.closure.digest,
      semantic: program.semanticDigest,
      plan,
    }),
    program,
    plan,
    status: "active",
    records: program.records,
    steps: plan.steps.map((step) => ({ id: step.id, status: "pending" })),
    needs: [],
    receipts: [],
    derivations: [],
    outstanding: [],
    acceptedEvents: [],
    diagnostics: [],
  };
  verifyBuildState(state);
  return state;
}

export function reduce(state: BuildState, event?: BuildEvent): CoreTransition {
  verifyBuildState(state);
  const next = event === undefined ? state : applyEvent(state, event);
  const transition = schedule(next);
  verifyBuildState(transition.state);
  return transition;
}

export function buildCommandKey(command: CoreCommand): string {
  if (command.kind === "invoke-producer") return producerKey(command.producer);
  if (command.kind === "fulfill-need") return command.need.id;
  return command.id;
}
