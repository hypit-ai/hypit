import type {
  BuildDefinition,
  BuildFact,
  BuildCommand,
  CommandResult,
  Need,
  TypedRecord,
} from "@hypit/protocol";
import { compareCodeUnits, sameCapability, sameType } from "@hypit/protocol";

import { invariant } from "./error.js";
import { resolveCapability, resolveProducer, verifyRecordStructure } from "./link.js";
import { producerStep } from "./plan.js";
import {
  buildNeedCommand,
  buildProducerCommand,
  factForBuildResult,
  initialBuildView,
} from "./reducer.js";
import type { BuildView } from "./view.js";

function insertDependency(dependents: Map<string, string[]>, record: string, step: string): void {
  const found = dependents.get(record);
  if (found === undefined) dependents.set(record, [step]);
  else found.push(step);
}

function mergeCommands(
  current: readonly BuildCommand[],
  removed: string,
  added: readonly BuildCommand[],
): readonly BuildCommand[] {
  const retained = current.filter((command) => command.id !== removed);
  const additions = [...added].sort((left, right) => compareCodeUnits(left.id, right.id));
  const merged: BuildCommand[] = [];
  let left = 0;
  let right = 0;
  while (left < retained.length || right < additions.length) {
    const existing = retained[left];
    const addition = additions[right];
    if (addition === undefined || existing !== undefined && compareCodeUnits(existing.id, addition.id) < 0) {
      merged.push(existing!);
      left++;
    } else {
      merged.push(addition);
      right++;
    }
  }
  return merged;
}

/**
 * Non-serializable incremental Core machine.
 *
 * Definition + Facts are the stored form. All indexes belong to this one Build execution and are
 * reconstructed from them; none is protocol or Store state.
 */
export class BuildMachine {
  readonly definition: BuildDefinition;
  #state: BuildView;
  #proposal: BuildFact | undefined;
  readonly #records = new Map<string, TypedRecord>();
  readonly #needs = new Map<string, Need>();
  readonly #commands = new Map<string, BuildCommand>();
  readonly #stepIndexes = new Map<string, number>();
  readonly #stepStatuses = new Map<string, "pending" | "complete">();
  readonly #missingInputs = new Map<string, number>();
  readonly #dependents = new Map<string, string[]>();
  readonly #missingGoals = new Set<string>();

  constructor(definition: BuildDefinition, facts: readonly BuildFact[] = []) {
    this.definition = structuredClone(definition);
    this.#state = initialBuildView(this.definition);
    for (const record of this.#state.records) this.#records.set(record.id, record);
    for (const need of this.#state.needs) this.#needs.set(need.id, need);
    for (const command of this.#state.outstanding) this.#commands.set(command.id, command);
    for (const [index, stepState] of this.#state.steps.entries()) {
      this.#stepIndexes.set(stepState.id, index);
      this.#stepStatuses.set(stepState.id, stepState.status);
      if (stepState.status !== "pending") continue;
      const step = producerStep(this.definition.plan, stepState.id);
      const missing = new Set(Object.values(step.inputs).filter((record) => !this.#records.has(record)));
      this.#missingInputs.set(step.id, missing.size);
      for (const record of missing) insertDependency(this.#dependents, record, step.id);
    }
    for (const goal of this.definition.plan.goals) {
      if (!this.#records.has(goal)) this.#missingGoals.add(goal);
    }
    for (const fact of facts) this.#applyAcceptedFact(fact);
  }

  get status(): BuildView["status"] {
    return this.#state.status;
  }

  commands(): readonly BuildCommand[] {
    return this.#state.outstanding;
  }

  record(id: string): TypedRecord | undefined {
    return this.#records.get(id);
  }

  /** Materialized read view. It is never the durable Store representation. */
  view(): BuildView {
    return this.#state;
  }

  /** Validate one result without mutating the machine before durable persistence succeeds. */
  evaluate(result: CommandResult): BuildFact | undefined {
    if (this.#proposal !== undefined) {
      throw new Error(`Build result ${this.#proposal.command} has not been durably applied`);
    }
    const fact = factForBuildResult(this.#state, result, {
      command: (id) => this.#commands.get(id),
      stepStatus: (id) => this.#stepStatuses.get(id),
      need: (id) => this.#needs.get(id),
      record: (id) => this.#records.get(id),
    });
    this.#proposal = fact;
    return fact;
  }

  /** Advance memory only after BuildStore.append has committed the proposed Fact. */
  commit(): void {
    const fact = this.#proposal;
    if (fact === undefined) throw new Error("Build machine has no evaluated result to commit");
    this.#proposal = undefined;
    this.#applyAcceptedFact(fact);
  }

  /** The only transition for an already accepted Fact, shared by durable replay and live commit. */
  #applyAcceptedFact(fact: BuildFact): void {
    invariant(fact.format === "hypit.build-fact@1", "UNSUPPORTED_BUILD_FACT", fact.command, fact.command);
    invariant(this.#state.status === "active", "FACT_AFTER_TERMINAL", fact.command, fact.command);
    const command = this.#commands.get(fact.command);
    invariant(command !== undefined, "UNKNOWN_COMMAND", `Fact references ${fact.command}`, fact.command);

    if (fact.kind === "producer-applied") {
      invariant(command.kind === "invoke-producer", "FACT_COMMAND_MISMATCH", fact.command, fact.command);
      invariant(command.step === fact.step, "FACT_STEP_MISMATCH", fact.step, fact.step);
      invariant(this.#stepStatuses.get(fact.step) === "pending", "STEP_ALREADY_COMPLETE", fact.step, fact.step);
      const step = producerStep(this.definition.plan, fact.step);
      const producer = resolveProducer(this.definition.program.closure, step.producer);
      invariant(fact.result.kind === step.result.kind, "PRODUCER_RESULT_KIND_MISMATCH", fact.step, fact.step);
      if (fact.result.kind === "output") {
        invariant(step.result.kind === "output" && fact.result.record.id === step.result.record,
          "FACT_RECORD_MISMATCH", fact.result.record.id, fact.step);
        invariant(producer.result.kind === "output" && producer.result.name === step.result.name,
          "PRODUCER_RESULT_PORT_MISMATCH", fact.step, fact.step);
        invariant(sameType(fact.result.record.type, producer.result.type),
          "FACT_RECORD_TYPE_MISMATCH", fact.result.record.id, fact.result.record.id);
        verifyRecordStructure(this.definition.program.closure, fact.result.record);
      } else {
        invariant(step.result.kind === "need" && fact.result.need.id === step.result.id
          && fact.result.need.result === step.result.record,
        "FACT_NEED_MISMATCH", fact.result.need.id, fact.step);
        invariant(producer.result.kind === "need" && producer.result.name === step.result.name,
          "PRODUCER_RESULT_PORT_MISMATCH", fact.step, fact.step);
        const capability = resolveCapability(this.definition.program.closure, producer.result.capability);
        invariant(sameCapability(fact.result.need.capability, producer.result.capability),
          "FACT_CAPABILITY_MISMATCH", fact.result.need.id, fact.result.need.id);
        invariant(sameType(fact.result.need.returns, capability.returns),
          "FACT_NEED_TYPE_MISMATCH", fact.result.need.id, fact.result.need.id);
        invariant(!this.#needs.has(fact.result.need.id), "DUPLICATE_NEED",
          fact.result.need.id, fact.result.need.id);
      }
    } else if (fact.kind === "need-applied") {
      invariant(command.kind === "fulfill-need", "FACT_COMMAND_MISMATCH", fact.command, fact.command);
      invariant(command.need.id === fact.need, "FACT_NEED_MISMATCH", fact.need, fact.need);
      invariant(command.need.result === fact.record.id, "FACT_RECORD_MISMATCH", fact.record.id, fact.need);
      invariant(sameType(command.need.returns, fact.record.type),
        "FACT_RECORD_TYPE_MISMATCH", fact.record.id, fact.record.id);
      invariant(!this.#records.has(fact.record.id), "NEED_ALREADY_FULFILLED", fact.need, fact.need);
      verifyRecordStructure(this.definition.program.closure, fact.record);
    }

    this.#commands.delete(fact.command);

    let records = this.#state.records;
    let needs = this.#state.needs;
    let steps = this.#state.steps;
    let diagnostics = this.#state.diagnostics;
    let status: BuildView["status"] = this.#state.status;
    const addedCommands: BuildCommand[] = [];

    if (fact.kind === "command-failed") {
      status = "failed";
      diagnostics = [...diagnostics, fact.diagnostic];
      this.#commands.clear();
    } else {
      const addedRecords = fact.kind === "producer-applied"
        ? fact.result.kind === "output" ? [fact.result.record] : []
        : [fact.record];
      if (fact.kind === "producer-applied") {
        const stepIndex = this.#stepIndexes.get(fact.step);
        invariant(stepIndex !== undefined, "UNKNOWN_STEP", fact.step, fact.step);
        this.#stepStatuses.set(fact.step, "complete");
        const updatedSteps = [...steps];
        updatedSteps[stepIndex] = { id: fact.step, status: "complete" };
        steps = updatedSteps;
        const addedNeeds = fact.result.kind === "need" ? [fact.result.need] : [];
        for (const need of addedNeeds) {
          this.#needs.set(need.id, need);
          const next = buildNeedCommand(need);
          this.#commands.set(next.id, next);
          addedCommands.push(next);
        }
        if (addedNeeds.length > 0) needs = [...needs, ...addedNeeds];
      }

      for (const record of addedRecords) {
        invariant(!this.#records.has(record.id), "DUPLICATE_RECORD", record.id, record.id);
        this.#records.set(record.id, record);
        this.#missingGoals.delete(record.id);
        for (const stepId of this.#dependents.get(record.id) ?? []) {
          const remaining = (this.#missingInputs.get(stepId) ?? 0) - 1;
          invariant(remaining >= 0, "STEP_INPUT_UNDERFLOW", stepId, stepId);
          this.#missingInputs.set(stepId, remaining);
          if (remaining === 0 && this.#stepStatuses.get(stepId) === "pending") {
            const next = buildProducerCommand(producerStep(this.definition.plan, stepId));
            this.#commands.set(next.id, next);
            addedCommands.push(next);
          }
        }
        this.#dependents.delete(record.id);
      }
      if (addedRecords.length > 0) records = [...records, ...addedRecords];

      if (this.#missingGoals.size === 0) {
        status = "complete";
        this.#commands.clear();
      } else if (this.#commands.size === 0) {
        status = "failed";
        diagnostics = [...diagnostics, {
          code: "BUILD_DEADLOCK",
          message: "no command can make progress toward the requested goals",
        }];
      }
    }

    this.#state = {
      ...this.#state,
      status,
      records,
      steps,
      needs,
      outstanding: status === "active" ? mergeCommands(this.#state.outstanding, fact.command, addedCommands) : [],
      diagnostics,
    };
  }
}

/** Reconstruct the disposable execution view from its only durable inputs. */
export function materializeBuild(
  definition: BuildDefinition,
  facts: readonly BuildFact[],
): BuildView {
  return new BuildMachine(definition, facts).view();
}
