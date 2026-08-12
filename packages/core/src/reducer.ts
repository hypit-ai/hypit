import type {
  BuildEvent,
  BuildPlan,
  BuildRequest,
  BuildState,
  CoreCommand,
  CoreTransition,
  CompiledGraph,
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
} from "@narratage/protocol";

import { canonicalize, digestOf, recordDigest } from "./canonical.js";
import { CoreError, invariant } from "./error.js";
import { resolveProducer, resolveType, sealRecord, verifyRecord } from "./link.js";
import { compileBuild, producerStep } from "./plan.js";
import {
  commandId,
  derivationId,
  eventDigest,
  needRequestDigest,
  receiptId,
} from "./provenance.js";
import { producerKey } from "./reference.js";
import { validateStoredValue } from "./schema.js";
import { verifyBuildState } from "./verify.js";

function withoutCommand(state: BuildState, id: string): readonly CoreCommand[] {
  return state.outstanding.filter((command) => command.id !== id);
}

function addAcceptedEvent(state: BuildState, event: BuildEvent): BuildState["acceptedEvents"] {
  return [...state.acceptedEvents, { id: event.id, digest: eventDigest(event) }];
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
  exactPortKeys(
    event.validations ?? {},
    producer.outputs
      .filter((port) => resolveType(state.program.closure, port.type).validator !== undefined)
      .map((port) => port.name),
    `${step.id}.validations`,
  );

  const inputs = inputRecords(state, command);
  const outputDrafts = producer.outputs
    .filter((port) => step.outputs[port.name] !== undefined)
    .map((port) => {
    const id = step.outputs[port.name];
    const rawValue = event.outputs[port.name];
    invariant(id !== undefined, "MISSING_OUTPUT_BINDING", `${step.id}.${port.name} is not bound`);
    invariant(rawValue !== undefined, "MISSING_OUTPUT_VALUE", `${step.id}.${port.name} returned no value`);
    const value = normalizeStoredValue(rawValue);
    validateStoredValue(value, resolveType(state.program.closure, port.type).schema, `$output.${step.id}.${port.name}`);
    return {
      id,
      type: port.type,
      value,
      digest: recordDigest(port.type, value),
      ...(event.validations?.[port.name] === undefined
        ? {}
        : { validation: event.validations[port.name] }),
    };
  });

  const needDrafts = producer.needs
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
      requestDigest: needRequestDigest(request),
    };
  });

  const derivationDraft: Omit<Derivation, "id"> = {
    step: step.id,
    producer: step.producer,
    implementationDigest: producer.implementation.digest,
    inputs: inputs.map((record) => ({ id: record.id, digest: record.digest })),
    outputs: outputDrafts.map(({ id, digest }) => ({ id, digest })),
    needs: needDrafts.map((need) => ({ id: need.id, requestDigest: need.requestDigest })),
    event: { id: event.id, digest: eventDigest(event) },
  };
  const id = derivationId(derivationDraft);
  const derivation: Derivation = { id, ...derivationDraft };
  const outputs: TypedRecord[] = outputDrafts.map((output) => sealRecord({
    id: output.id,
    type: output.type,
    value: output.value,
    origin: { kind: "derived", derivation: id },
    ...(output.validation === undefined ? {} : { validation: output.validation }),
  }));
  outputs.forEach((record) => verifyRecord(state.program.closure, record));
  const needs: Need[] = needDrafts.map((need) => ({ ...need, requestedBy: id }));

  return {
    ...state,
    records: [...state.records, ...outputs],
    needs: [...state.needs, ...needs],
    derivations: [...state.derivations, derivation],
    steps: state.steps.map((item) =>
      item.id === step.id ? { id: item.id, status: "complete", derivation: id } : item,
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
  const value = normalizeStoredValue(event.value);
  validateStoredValue(value, resolveType(state.program.closure, need.returns).schema, `$need.${need.id}`);
  const outputDigest = recordDigest(need.returns, value);
  const receiptDraft: Omit<Receipt, "id"> = {
    need: need.id,
    requestDigest: event.requestDigest,
    fulfiller: event.fulfiller,
    ...(event.implementation === undefined ? {} : { implementation: event.implementation }),
    output: need.result,
    outputDigest,
    event: { id: event.id, digest: eventDigest(event) },
  };
  const receipt: Receipt = { id: receiptId(receiptDraft), ...receiptDraft };
  const record: TypedRecord = {
    id: need.result,
    type: need.returns,
    value,
    digest: outputDigest,
    origin: { kind: "observed", receipt: receipt.id },
    ...(event.validation === undefined ? {} : { validation: event.validation }),
  };
  verifyRecord(state.program.closure, record);

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
  return state.plan.goals.every((goal) => state.records.some((record) => record.id === goal.record));
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

export function start(
  program: LinkedProgram,
  graph: CompiledGraph,
  request: BuildRequest,
): BuildState {
  const plan: BuildPlan = compileBuild(program, graph, request);
  const state: BuildState = {
    format: "svml.build@1",
    id: digestOf({
      closure: program.closure.digest,
      semantic: program.semanticDigest,
      graph: graph.id,
      request: request.digest,
      plan: plan.id,
    }),
    program,
    graph,
    request,
    plan,
    status: "active",
    records: [...program.records, ...plan.initialValues],
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
