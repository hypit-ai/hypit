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
import { resolveProducer, verifyLinkedProgram, verifyRecordStructure } from "./link.js";
import { producerStep, selectedProvidedRecords, validatePlan } from "./plan.js";
import { commandId, derivationId, needRequestDigest, receiptId } from "./provenance.js";
import { sameCapability, sameType } from "./reference.js";

function uniqueIndex<T>(items: readonly T[], key: (item: T) => string, kind: string): ReadonlyMap<string, T> {
  const seen = new Map<string, T>();
  for (const item of items) {
    const id = key(item);
    invariant(!seen.has(id), "DUPLICATE_STATE_ID", `duplicate ${kind} ${id}`, id);
    seen.set(id, item);
  }
  return seen;
}

type StateIndex = {
  readonly records: ReadonlyMap<string, TypedRecord>;
  readonly steps: ReadonlyMap<string, BuildState["steps"][number]>;
  readonly needs: ReadonlyMap<string, Need>;
  readonly receipts: ReadonlyMap<string, Receipt>;
  readonly derivations: ReadonlyMap<string, Derivation>;
  readonly acceptedEvents: ReadonlyMap<string, BuildState["acceptedEvents"][number]>;
  readonly programRecords: ReadonlyMap<string, TypedRecord>;
};

function verifyDerivation(state: BuildState, index: StateIndex, derivation: Derivation): void {
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
    const record = index.records.get(binding.id);
    invariant(record !== undefined, "DERIVATION_RECORD_MISSING", `${binding.id} is missing`, derivation.id);
    invariant(record.digest === binding.digest, "DERIVATION_RECORD_DIGEST", `${binding.id} digest differs`, derivation.id);
  }
  for (const binding of derivation.needs) {
    const need = index.needs.get(binding.id);
    invariant(need !== undefined, "DERIVATION_NEED_MISSING", `${binding.id} is missing`, derivation.id);
    invariant(
      need.requestDigest === binding.requestDigest,
      "DERIVATION_NEED_DIGEST",
      `${binding.id} request digest differs`,
      derivation.id,
    );
  }
  const accepted = index.acceptedEvents.get(derivation.event.id);
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

function verifyReceipt(index: StateIndex, receipt: Receipt): void {
  const need = index.needs.get(receipt.need);
  invariant(need !== undefined, "RECEIPT_UNKNOWN_NEED", `${receipt.id} references an unknown need`);
  invariant(receipt.fulfiller.length > 0, "EMPTY_FULFILLER", `${receipt.id} fulfiller is empty`);
  invariant(
    receipt.requestDigest === need.requestDigest,
    "REQUEST_DIGEST_MISMATCH",
    `${receipt.id} request digest does not match`,
  );
  const record = index.records.get(receipt.output);
  invariant(record !== undefined, "RECEIPT_OUTPUT_MISSING", `${receipt.id} output is missing`);
  invariant(receipt.output === need.result, "RECEIPT_OUTPUT_BINDING", `${receipt.id} output is not its Need result`);
  invariant(sameType(record.type, need.returns), "RECEIPT_OUTPUT_TYPE", `${receipt.id} output type differs`);
  invariant(record.digest === receipt.outputDigest, "RECEIPT_OUTPUT_MISMATCH", `${receipt.id} output differs`);
  invariant(
    record.origin.kind === "observed" && record.origin.receipt === receipt.id,
    "RECEIPT_ORIGIN_MISMATCH",
    `${receipt.id} output has another origin`,
  );
  invariant(
    index.acceptedEvents.get(receipt.event.id)?.digest === receipt.event.digest,
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

function verifyOutstanding(state: BuildState, index: StateIndex, command: CoreCommand): void {
  if (command.kind === "invoke-producer") {
    const step = index.steps.get(command.step);
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
  const need = index.needs.get(command.need.id);
  invariant(need !== undefined, "OUTSTANDING_NEED_UNKNOWN", `${command.need.id} is unknown`);
  invariant(index.records.get(need.result) === undefined, "OUTSTANDING_NEED_COMPLETE", `${need.id} is fulfilled`);
  const expected: CoreCommand = {
    kind: "fulfill-need",
    id: commandId(state.id, "need", need.id),
    need,
  };
  invariant(digestOf(command) === digestOf(expected), "COMMAND_NEED_MISMATCH", command.id);
}

export function verifyBuildState(state: BuildState): void {
  invariant(state.format === "narratage.build@1", "UNSUPPORTED_BUILD", "unsupported build state format");
  invariant(
    state.status === "active" || state.status === "complete" || state.status === "failed",
    "INVALID_BUILD_STATUS",
    "build status is invalid",
  );
  invariant(isDigest(state.id), "INVALID_DIGEST", "build id is invalid");

  verifyLinkedProgram(state.program);
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

  const index: StateIndex = {
    records: uniqueIndex(state.records, (item) => item.id, "record"),
    steps: uniqueIndex(state.steps, (item) => item.id, "step state"),
    needs: uniqueIndex(state.needs, (item) => item.id, "need"),
    receipts: uniqueIndex(state.receipts, (item) => item.id, "receipt"),
    derivations: uniqueIndex(state.derivations, (item) => item.id, "derivation"),
    acceptedEvents: uniqueIndex(state.acceptedEvents, (item) => item.id, "event"),
    programRecords: new Map(state.program.records.map((item) => [item.id, item])),
  };
  uniqueIndex(state.outstanding, (item) => item.id, "command");

  invariant(
    JSON.stringify(state.steps.map((item) => item.id).sort()) ===
      JSON.stringify(state.plan.steps.map((item) => item.id).sort()),
    "STEP_STATE_MISMATCH",
    "build step state does not match the plan",
  );

  for (const record of state.records) verifyRecordStructure(state.program.closure, record);
  for (const authored of state.program.records) {
    const record = index.records.get(authored.id);
    invariant(record?.digest === authored.digest, "AUTHORED_RECORD_CHANGED", `${authored.id} changed`);
  }
  const providedRecords = selectedProvidedRecords(state.program, state.graph, state.plan);
  const providedById = new Map(providedRecords.map((item) => [item.id, item]));
  const selectedRecords = new Set(state.plan.selections.map((selection) => selection.record));
  for (const provided of providedRecords) {
    const record = index.records.get(provided.id);
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
        index.programRecords.get(record.id)?.digest === record.digest,
        "INJECTED_AUTHORED_RECORD",
        `${record.id} was not present in the linked author program`,
      );
    } else if (record.origin.kind === "derived") {
      const origin = record.origin;
      const derivation = index.derivations.get(origin.derivation);
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
      const inputs = derivation.inputs.map((binding) => index.records.get(binding.id));
      invariant(inputs.every((item) => item !== undefined), "DERIVATION_INPUT_MISSING", derivation.id);
    } else if (record.origin.kind === "observed") {
      const origin = record.origin;
      const receipt = index.receipts.get(origin.receipt);
      invariant(receipt?.output === record.id, "OBSERVED_ORIGIN_MISMATCH", `${record.id} has no receipt`);
    } else {
      const origin = record.origin;
      const expected = providedById.get(record.id);
      invariant(
        expected !== undefined && digestOf(expected) === digestOf(record),
        "INJECTED_PROVIDED_RECORD",
        `${record.id} was not supplied by this BuildRequest`,
        record.id,
      );
      invariant(
        origin.kind === "provided"
          && selectedRecords.has(record.id),
        "PROVIDED_ORIGIN_MISMATCH",
        `${record.id} is not bound to its selected Candidate`,
        record.id,
      );
    }
  }

  for (const need of state.needs) {
    invariant(
      need.requestDigest === needRequestDigest(need),
      "NEED_DIGEST_MISMATCH",
      `${need.id} digest differs`,
    );
    const derivation = index.derivations.get(need.requestedBy);
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
      && plannedPort?.[1].result === need.result,
      "NEED_PLAN_BINDING_MISMATCH",
      `${need.id} differs from its locked Producer Need port`,
      need.id,
    );
  }
  for (const receipt of state.receipts) verifyReceipt(index, receipt);
  for (const derivation of state.derivations) verifyDerivation(state, index, derivation);

  for (const stepState of state.steps) {
    if (stepState.status === "complete") {
      invariant(stepState.derivation !== undefined, "COMPLETE_STEP_NO_DERIVATION", stepState.id);
      invariant(
        index.derivations.get(stepState.derivation)?.step === stepState.id,
        "STEP_DERIVATION_MISMATCH",
        stepState.id,
      );
    }
  }

  for (const command of state.outstanding) verifyOutstanding(state, index, command);
  for (const event of state.acceptedEvents) {
    invariant(event.id.length > 0, "EMPTY_EVENT_ID", "accepted event id is empty");
    invariant(isDigest(event.digest), "INVALID_DIGEST", `${event.id} digest is invalid`);
  }

  if (state.status === "complete") {
    invariant(state.outstanding.length === 0, "COMPLETE_WITH_COMMANDS", "complete build has commands");
    for (const goal of state.plan.goals) {
      const record = index.records.get(goal.record);
      invariant(record !== undefined, "COMPLETE_GOAL_MISSING", `${goal.record} is missing`);
      invariant(sameType(record.type, goal.type), "COMPLETE_GOAL_TYPE_MISMATCH", goal.record);
    }
  }
  if (state.status === "failed") {
    invariant(state.diagnostics.length > 0, "FAILED_WITHOUT_DIAGNOSTIC", "failed build has no diagnostic");
  }
}
