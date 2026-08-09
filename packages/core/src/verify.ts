import type {
  BuildState,
  CoreCommand,
  Derivation,
  Need,
  Receipt,
  TypedRecord,
} from "@narratage/protocol";

import { digestOf, isDigest } from "./canonical.js";
import { invariant } from "./error.js";
import { link, resolveProducer, verifyRecord } from "./link.js";
import { producerStep, validatePlan } from "./plan.js";
import { commandId, derivationId, needRequestDigest, receiptId } from "./provenance.js";
import { sameCapability, sameType } from "./reference.js";

function unique<T>(items: readonly T[], key: (item: T) => string, kind: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    const id = key(item);
    invariant(!seen.has(id), "DUPLICATE_STATE_ID", `duplicate ${kind} ${id}`, id);
    seen.add(id);
  }
}

function findRecord(state: BuildState, id: string): TypedRecord | undefined {
  return state.records.find((record) => record.id === id);
}

function validConformance(value: string): boolean {
  return value === "exact" || value === "substitute";
}

function verifyDerivation(state: BuildState, derivation: Derivation): void {
  const step = producerStep(state.plan, derivation.step);
  const producer = resolveProducer(state.program.closure, derivation.producer);
  invariant(
    step.producer.module.name === derivation.producer.module.name &&
      step.producer.module.version === derivation.producer.module.version &&
      step.producer.name === derivation.producer.name,
    "DERIVATION_PRODUCER_MISMATCH",
    `${derivation.id} does not use its planned producer`,
    derivation.id,
  );
  invariant(
    derivation.implementationDigest === producer.implementation.digest,
    "IMPLEMENTATION_DIGEST_MISMATCH",
    `${derivation.id} implementation digest does not match`,
    derivation.id,
  );
  invariant(
    JSON.stringify(derivation.inputs.map((item) => item.id).sort()) ===
      JSON.stringify(Object.values(step.inputs).sort()),
    "DERIVATION_INPUT_MISMATCH",
    `${derivation.id} input records do not match its step`,
    derivation.id,
  );
  invariant(
    JSON.stringify(derivation.outputs.map((item) => item.id).sort()) ===
      JSON.stringify(Object.values(step.outputs).sort()),
    "DERIVATION_OUTPUT_MISMATCH",
    `${derivation.id} output records do not match its step`,
    derivation.id,
  );
  invariant(
    JSON.stringify(derivation.needs.map((item) => item.id).sort()) ===
      JSON.stringify(Object.values(step.needs).map((binding) => binding.id).sort()),
    "DERIVATION_NEED_MISMATCH",
    `${derivation.id} needs do not match its step`,
    derivation.id,
  );
  for (const binding of [...derivation.inputs, ...derivation.outputs]) {
    const record = findRecord(state, binding.id);
    invariant(record !== undefined, "DERIVATION_RECORD_MISSING", `${binding.id} is missing`, derivation.id);
    invariant(record.digest === binding.digest, "DERIVATION_RECORD_DIGEST", `${binding.id} digest differs`, derivation.id);
  }
  for (const binding of derivation.needs) {
    const need = state.needs.find((item) => item.id === binding.id);
    invariant(need !== undefined, "DERIVATION_NEED_MISSING", `${binding.id} is missing`, derivation.id);
    invariant(
      need.requestDigest === binding.requestDigest,
      "DERIVATION_NEED_DIGEST",
      `${binding.id} request digest differs`,
      derivation.id,
    );
  }
  const accepted = state.acceptedEvents.find((item) => item.id === derivation.event.id);
  invariant(
    accepted?.digest === derivation.event.digest,
    "DERIVATION_EVENT_MISMATCH",
    `${derivation.id} event differs`,
    derivation.id,
  );
  const { id: _id, ...content } = derivation;
  invariant(
    derivation.id === derivationId(content),
    "DERIVATION_DIGEST_MISMATCH",
    `${derivation.id} content does not match its identity`,
    derivation.id,
  );
}

function verifyReceipt(state: BuildState, receipt: Receipt): void {
  const need = state.needs.find((item) => item.id === receipt.need);
  invariant(need !== undefined, "RECEIPT_UNKNOWN_NEED", `${receipt.id} references an unknown need`);
  invariant(receipt.fulfiller.length > 0, "EMPTY_FULFILLER", `${receipt.id} fulfiller is empty`);
  if (receipt.implementation !== undefined) {
    invariant(isDigest(receipt.implementation.digest), "INVALID_IMPLEMENTATION_DIGEST", receipt.id);
    invariant(
      isDigest(receipt.implementation.configurationDigest),
      "INVALID_CONFIGURATION_DIGEST",
      receipt.id,
    );
    invariant(
      receipt.implementation.runtimeClosure === undefined
        || isDigest(receipt.implementation.runtimeClosure),
      "INVALID_RUNTIME_CLOSURE_DIGEST",
      receipt.id,
    );
  }
  invariant(validConformance(receipt.fulfillmentConformance), "INVALID_CONFORMANCE", receipt.id);
  invariant(validConformance(receipt.conformance), "INVALID_CONFORMANCE", receipt.id);
  invariant(
    ["executed", "cache", "manual", "provided"].includes(receipt.delivery),
    "INVALID_DELIVERY",
    receipt.id,
  );
  invariant(
    receipt.requestDigest === need.requestDigest,
    "REQUEST_DIGEST_MISMATCH",
    `${receipt.id} request digest does not match`,
  );
  invariant(
    receipt.conformance === (
      need.conformanceFloor === "substitute" || receipt.fulfillmentConformance === "substitute"
        ? "substitute"
        : "exact"
    ),
    "CONFORMANCE_FLOOR_MISMATCH",
    `${receipt.id} does not inherit its Need conformance floor`,
  );
  invariant(
    need.accepts === "substitute" || receipt.fulfillmentConformance === "exact",
    "SUBSTITUTE_NOT_ACCEPTED",
    `${receipt.id} did not exactly fulfill the selected capability`,
  );
  const record = findRecord(state, receipt.output);
  invariant(record !== undefined, "RECEIPT_OUTPUT_MISSING", `${receipt.id} output is missing`);
  invariant(receipt.output === need.result, "RECEIPT_OUTPUT_BINDING", `${receipt.id} output is not its Need result`);
  invariant(sameType(record.type, need.returns), "RECEIPT_OUTPUT_TYPE", `${receipt.id} output type differs`);
  invariant(record.conformance === receipt.conformance, "RECEIPT_OUTPUT_CONFORMANCE", receipt.id);
  invariant(record.digest === receipt.outputDigest, "RECEIPT_OUTPUT_MISMATCH", `${receipt.id} output differs`);
  invariant(
    record.origin.kind === "observed" && record.origin.receipt === receipt.id,
    "RECEIPT_ORIGIN_MISMATCH",
    `${receipt.id} output has another origin`,
  );
  invariant(
    state.acceptedEvents.some((item) => item.id === receipt.event.id && item.digest === receipt.event.digest),
    "RECEIPT_EVENT_MISMATCH",
    `${receipt.id} accepted event differs`,
  );
  const { id: _id, ...content } = receipt;
  invariant(
    receipt.id === receiptId(content),
    "RECEIPT_DIGEST_MISMATCH",
    `${receipt.id} content does not match its identity`,
  );
}

function verifyOutstanding(state: BuildState, command: CoreCommand): void {
  if (command.kind === "complete") {
    invariant(false, "STORED_COMPLETE_COMMAND", "complete commands must not remain outstanding");
  }
  if (command.kind === "invoke-producer") {
    const step = state.steps.find((item) => item.id === command.step);
    invariant(step?.status === "pending", "OUTSTANDING_STEP_COMPLETE", `${command.step} is complete`);
    const planned = producerStep(state.plan, command.step);
    const expected: CoreCommand = {
      kind: "invoke-producer",
      id: commandId(state.id, "producer", planned.id),
      step: planned.id,
      producer: planned.producer,
      inputs: planned.inputs,
    };
    invariant(digestOf(command) === digestOf(expected), "COMMAND_PRODUCER_MISMATCH", command.id);
    return;
  }
  const need = state.needs.find((item) => item.id === command.need.id);
  invariant(need !== undefined, "OUTSTANDING_NEED_UNKNOWN", `${command.need.id} is unknown`);
  invariant(findRecord(state, need.result) === undefined, "OUTSTANDING_NEED_COMPLETE", `${need.id} is fulfilled`);
  const expected: CoreCommand = {
    kind: "fulfill-need",
    id: commandId(state.id, "need", need.id),
    need,
  };
  invariant(digestOf(command) === digestOf(expected), "COMMAND_NEED_MISMATCH", command.id);
}

export function verifyBuildState(state: BuildState): void {
  invariant(state.format === "svml.build@1", "UNSUPPORTED_BUILD", "unsupported build state format");
  invariant(
    state.status === "active" || state.status === "complete" || state.status === "failed",
    "INVALID_BUILD_STATUS",
    "build status is invalid",
  );
  invariant(isDigest(state.id), "INVALID_DIGEST", "build id is invalid");

  const linked = link(state.program.closure, state.program.modules);
  invariant(
    linked.semanticDigest === state.program.semanticDigest,
    "PROGRAM_SEMANTIC_DIGEST_MISMATCH",
    "linked program semantic digest does not match",
  );
  invariant(
    JSON.stringify(
      [...linked.records]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((record) => ({ id: record.id, digest: record.digest })),
    ) ===
      JSON.stringify(
        [...state.program.records]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((record) => ({ id: record.id, digest: record.digest })),
      ),
    "PROGRAM_RECORD_MISMATCH",
    "linked program records do not match its typed modules",
  );
  invariant(
    state.id ===
      digestOf({
        closure: state.program.closure.digest,
        semantic: state.program.semanticDigest,
        graph: state.graph.id,
        request: state.request.digest,
        plan: state.plan.id,
      }),
    "BUILD_ID_MISMATCH",
    "build id does not match its program and plan",
  );
  validatePlan(state.program, state.graph, state.request, state.plan);

  unique(state.records, (item) => item.id, "record");
  unique(state.steps, (item) => item.id, "step state");
  unique(state.needs, (item) => item.id, "need");
  unique(state.receipts, (item) => item.id, "receipt");
  unique(state.derivations, (item) => item.id, "derivation");
  unique(state.outstanding, (item) => item.id, "command");
  unique(state.acceptedEvents, (item) => item.id, "event");

  invariant(
    JSON.stringify(state.steps.map((item) => item.id).sort()) ===
      JSON.stringify(state.plan.steps.map((item) => item.id).sort()),
    "STEP_STATE_MISMATCH",
    "build step state does not match the plan",
  );

  for (const record of state.records) {
    invariant(validConformance(record.conformance), "INVALID_CONFORMANCE", record.id);
    verifyRecord(state.program.closure, record);
  }
  for (const authored of state.program.records) {
    const record = findRecord(state, authored.id);
    invariant(record?.digest === authored.digest, "AUTHORED_RECORD_CHANGED", `${authored.id} changed`);
  }
  for (const provided of state.plan.initialValues) {
    const record = findRecord(state, provided.id);
    invariant(
      record !== undefined && digestOf(record) === digestOf(provided),
      "PROVIDED_RECORD_CHANGED",
      `${provided.id} differs from its compiled Provided Value`,
      provided.id,
    );
  }

  for (const record of state.records) {
    if (record.origin.kind === "authored") {
      invariant(
        state.program.records.some((item) => item.id === record.id && item.digest === record.digest),
        "INJECTED_AUTHORED_RECORD",
        `${record.id} was not present in the linked author program`,
      );
    } else if (record.origin.kind === "derived") {
      const origin = record.origin;
      const derivation = state.derivations.find((item) => item.id === origin.derivation);
      invariant(
        derivation !== undefined,
        "DERIVED_ORIGIN_MISMATCH",
        `${record.id} has unknown derivation ${origin.derivation}`,
      );
      invariant(
        derivation.outputs.some((item) => item.id === record.id && item.digest === record.digest),
        "DERIVED_ORIGIN_MISMATCH",
        `${record.id} is not an output of ${origin.derivation}`,
      );
      const inputs = derivation.inputs.map((binding) => findRecord(state, binding.id));
      invariant(inputs.every((item) => item !== undefined), "DERIVATION_INPUT_MISSING", derivation.id);
      const step = producerStep(state.plan, derivation.step);
      const expected = step.fidelity === "substitute"
        || inputs.some((item) => item?.conformance === "substitute")
        ? "substitute"
        : "exact";
      invariant(record.conformance === expected, "CONFORMANCE_NOT_PROPAGATED", `${record.id} conformance differs`);
    } else if (record.origin.kind === "observed") {
      const origin = record.origin;
      const receipt = state.receipts.find((item) => item.id === origin.receipt);
      invariant(receipt?.output === record.id, "OBSERVED_ORIGIN_MISMATCH", `${record.id} has no receipt`);
    } else {
      const origin = record.origin;
      const expected = state.plan.initialValues.find((item) => item.id === record.id);
      invariant(
        expected !== undefined && digestOf(expected) === digestOf(record),
        "INJECTED_PROVIDED_RECORD",
        `${record.id} was not supplied by this BuildRequest`,
        record.id,
      );
      invariant(
        origin.kind === "provided"
          && origin.requestDigest === state.request.digest
          && state.plan.selections.some((selection) =>
            selection.record === record.id && selection.candidate === origin.candidate),
        "PROVIDED_ORIGIN_MISMATCH",
        `${record.id} is not bound to its selected Candidate`,
        record.id,
      );
    }
  }

  for (const need of state.needs) {
    invariant(need.accepts === "exact" || need.accepts === "substitute", "INVALID_NEED_ACCEPTANCE", need.id);
    invariant(validConformance(need.conformanceFloor), "INVALID_CONFORMANCE", need.id);
    invariant(
      need.requestDigest === needRequestDigest(need),
      "NEED_DIGEST_MISMATCH",
      `${need.id} digest differs`,
    );
    const derivation = state.derivations.find((item) => item.id === need.requestedBy);
    invariant(
      derivation?.needs.some((item) => item.id === need.id && item.requestDigest === need.requestDigest),
      "NEED_ORIGIN_MISMATCH",
      `${need.id} has no derivation`,
    );
    const step = derivation === undefined ? undefined : producerStep(state.plan, derivation.step);
    const producer = step === undefined ? undefined : resolveProducer(state.program.closure, step.producer);
    const plannedPort = step === undefined
      ? undefined
      : Object.entries(step.needs).find(([, binding]) => binding.id === need.id);
    const declaration = plannedPort === undefined
      ? undefined
      : producer?.needs.find((port) => port.name === plannedPort[0]);
    invariant(
      declaration !== undefined
      && sameCapability(need.capability, declaration.capability)
      && sameType(need.returns, declaration.returns)
      && plannedPort?.[1].result === need.result
      && plannedPort[1].accepts === need.accepts,
      "NEED_PLAN_BINDING_MISMATCH",
      `${need.id} differs from its locked Producer Need port`,
      need.id,
    );
    const inherited = step?.fidelity === "substitute" || derivation?.inputs.some(
      (binding) => findRecord(state, binding.id)?.conformance === "substitute",
    ) ? "substitute" : "exact";
    invariant(
      need.conformanceFloor === inherited,
      "CONFORMANCE_FLOOR_MISMATCH",
      `${need.id} conformance floor differs from its Producer inputs`,
    );
  }
  for (const receipt of state.receipts) verifyReceipt(state, receipt);
  for (const derivation of state.derivations) verifyDerivation(state, derivation);

  for (const stepState of state.steps) {
    if (stepState.status === "complete") {
      invariant(stepState.derivation !== undefined, "COMPLETE_STEP_NO_DERIVATION", stepState.id);
      invariant(
        state.derivations.some((item) => item.id === stepState.derivation && item.step === stepState.id),
        "STEP_DERIVATION_MISMATCH",
        stepState.id,
      );
    }
  }

  for (const command of state.outstanding) verifyOutstanding(state, command);
  for (const event of state.acceptedEvents) {
    invariant(event.id.length > 0, "EMPTY_EVENT_ID", "accepted event id is empty");
    invariant(isDigest(event.digest), "INVALID_DIGEST", `${event.id} digest is invalid`);
  }

  if (state.status === "complete") {
    invariant(state.outstanding.length === 0, "COMPLETE_WITH_COMMANDS", "complete build has commands");
    for (const goal of state.plan.goals) {
      const record = findRecord(state, goal.record);
      invariant(record !== undefined, "COMPLETE_GOAL_MISSING", `${goal.record} is missing`);
      invariant(sameType(record.type, goal.type), "COMPLETE_GOAL_TYPE_MISMATCH", goal.record);
      invariant(
        goal.accepts === "substitute" || record.conformance === "exact",
        "COMPLETE_GOAL_SUBSTITUTE",
        goal.record,
      );
    }
  }
  if (state.status === "failed") {
    invariant(state.diagnostics.length > 0, "FAILED_WITHOUT_DIAGNOSTIC", "failed build has no diagnostic");
  }
}
