import type {
  BuildDefinition,
  BuildFact,
  BuildCommand,
  CommandResult,
  CommandId,
  FulfillNeedCommand,
  InvokeProducerCommand,
  Need,
  ProducerCompletedEvent,
  ProducerAppliedFact,
  TypedRecord,
} from "@hypit/protocol";

import { compareCodeUnits, normalizeValue, SvmlError } from "@hypit/protocol";
import { invariant } from "./error.js";
import { resolveCapability, resolveProducer, verifyRecordStructure } from "./link.js";
import { producerStep, verifyBuildPlan } from "./plan.js";
import type { BuildView } from "./view.js";

function commandId(kind: "producer" | "need", subject: string): string {
  return `${kind}:${subject}`;
}

export function buildNeedCommand(need: Need): FulfillNeedCommand {
  return { kind: "fulfill-need", id: commandId("need", need.id), need };
}

export function buildProducerCommand(step: BuildView["plan"]["steps"][number]): InvokeProducerCommand {
  return {
    kind: "invoke-producer",
    id: commandId("producer", step.id),
    step: step.id,
    producer: step.producer,
    inputs: step.inputs,
  };
}

function acceptedProducerResult(
  state: Pick<BuildView, "program">,
  step: BuildView["plan"]["steps"][number],
  event: ProducerCompletedEvent,
): ProducerAppliedFact["result"] {
  const producer = resolveProducer(state.program.closure, step.producer);
  invariant(event.result.kind === step.result.kind, "PRODUCER_RESULT_KIND_MISMATCH",
    `${step.id} returned ${event.result.kind}, not ${step.result.kind}`, step.id);
  if (step.result.kind === "output") {
    invariant(event.result.kind === "output", "PRODUCER_RESULT_KIND_MISMATCH", step.id, step.id);
    const port = producer.result;
    invariant(port.kind === "output" && port.name === step.result.name, "PRODUCER_RESULT_PORT_MISMATCH",
      `${step.id} does not declare output ${step.result.name}`, step.id);
    const record: TypedRecord = {
      id: step.result.record,
      type: port.type,
      value: normalizeValue(event.result.value),
    };
    verifyRecordStructure(state.program.closure, record);
    return { kind: "output", record };
  }
  invariant(event.result.kind === "need", "PRODUCER_RESULT_KIND_MISMATCH", step.id, step.id);
  const port = producer.result;
  invariant(port.kind === "need" && port.name === step.result.name, "PRODUCER_RESULT_PORT_MISMATCH",
    `${step.id} does not declare Need ${step.result.name}`, step.id);
  return {
    kind: "need",
    need: {
      id: step.result.id,
      capability: port.capability,
      returns: resolveCapability(state.program.closure, port.capability).returns,
      constraints: normalizeValue(event.result.constraints),
      result: step.result.record,
    },
  };
}

function goalsComplete(state: BuildView, records: ReadonlySet<string>): boolean {
  return state.plan.goals.every((goal) => records.has(goal));
}

/**
 * Every command that can run now is outstanding: the ones already issued, plus every Need whose
 * result is missing and every pending step whose inputs exist. Scheduling is incremental, so a
 * cheap Producer never waits behind an unrelated external request that happens to share a turn.
 */
function schedule(state: BuildView): BuildView {
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
  const commands: BuildCommand[] = [...state.outstanding];
  for (const need of state.needs) {
    if (records.has(need.result)) continue;
    const command = buildNeedCommand(need);
    if (issued.has(command.id)) continue;
    commands.push(command);
  }

  for (const stepState of state.steps) {
    if (stepState.status !== "pending") continue;
    const step = producerStep(state.plan, stepState.id);
    if (!Object.values(step.inputs).every((id) => records.has(id))) {
      continue;
    }
    const command = buildProducerCommand(step);
    if (issued.has(command.id)) continue;
    commands.push(command);
  }

  commands.sort((left, right) => compareCodeUnits(left.id, right.id));
  if (commands.length === 0) {
    const failed: BuildView = {
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

  const scheduled: BuildView = { ...state, outstanding: commands };
  return scheduled;
}

/** Seal one already selected execution. Graphs and Candidates do not cross this boundary. */
export function defineBuild(
  input: Omit<BuildDefinition, "format">,
): BuildDefinition {
  verifyBuildPlan(input.program, input.plan);
  return { format: "hypit.build-definition@1", ...input };
}

/** Create the first disposable execution view for one immutable Definition. */
export function initialBuildView(definition: BuildDefinition): BuildView {
  invariant(definition.format === "hypit.build-definition@1", "UNSUPPORTED_BUILD_DEFINITION", definition.format);
  verifyBuildPlan(definition.program, definition.plan);
  return schedule({
    program: definition.program,
    plan: definition.plan,
    status: "active",
    records: [...definition.program.records],
    steps: definition.plan.steps.map((step) => ({ id: step.id, status: "pending" })),
    needs: [],
    outstanding: [],
    diagnostics: [],
  });
}

export type BuildFactLookup = {
  readonly command: (id: CommandId) => BuildCommand | undefined;
  readonly stepStatus: (id: string) => "pending" | "complete" | undefined;
  readonly need: (id: string) => Need | undefined;
  readonly record: (id: string) => TypedRecord | undefined;
};

/**
 * Validate one result and derive its durable Fact without advancing scheduling.
 * BuildMachine supplies its private indexes.
 */
export function factForCommandResult(
  state: Pick<BuildView, "program" | "plan" | "steps" | "needs" | "records" | "outstanding">,
  event: CommandResult,
  indexed?: BuildFactLookup,
): BuildFact {
  const lookup: BuildFactLookup = indexed ?? {
    command: (id) => state.outstanding.find((item) => item.id === id),
    stepStatus: (id) => state.steps.find((item) => item.id === id)?.status,
    need: (id) => state.needs.find((item) => item.id === id),
    record: (id) => state.records.find((item) => item.id === id),
  };
  const command = lookup.command(event.command);
  invariant(command !== undefined, "UNKNOWN_COMMAND", `event references ${event.command}`, event.command);

  if (event.kind === "command-failed") {
    return {
      format: "hypit.build-fact@1",
      kind: "command-failed",
      command: event.command,
      diagnostic: { code: event.code, message: event.message, subject: event.command },
    };
  }
  if (command.kind === "invoke-producer" && event.kind === "producer-completed") {
    const step = producerStep(state.plan, command.step);
    invariant(lookup.stepStatus(step.id) === "pending", "STEP_ALREADY_COMPLETE",
      `${step.id} is already complete`, step.id);
    const result = acceptedProducerResult(state, step, event);
    return {
      format: "hypit.build-fact@1",
      kind: "producer-applied",
      command: event.command,
      step: command.step,
      result,
    };
  }
  if (command.kind === "fulfill-need" && event.kind === "need-fulfilled") {
    const need = lookup.need(command.need.id);
    invariant(need !== undefined, "UNKNOWN_NEED", `unknown need ${command.need.id}`, command.need.id);
    invariant(lookup.record(need.result) === undefined, "NEED_ALREADY_FULFILLED",
      `${need.id} is already fulfilled`, need.id);
    const record: TypedRecord = {
      id: need.result,
      type: need.returns,
      value: normalizeValue(event.value),
    };
    verifyRecordStructure(state.program.closure, record);
    return {
      format: "hypit.build-fact@1",
      kind: "need-applied",
      command: event.command,
      need: need.id,
      record,
    };
  }
  throw new SvmlError(
    "EVENT_COMMAND_MISMATCH",
    `${event.kind} cannot complete ${command.kind}`,
    command.id,
  );
}
