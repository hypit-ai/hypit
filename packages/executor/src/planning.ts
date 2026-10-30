import { BuildMachine, resolveCapability, resolveProducer } from "@hypit/kernel";
import type { BuildView } from "@hypit/kernel";
import type {
  BuildDefinition,
  ProducerRef,
  TypeRef,
} from "@hypit/protocol";
import { RefinementRegistry } from "@hypit/refinement";
import type { RefinementRegistryLike } from "@hypit/refinement";
import type { ProducerExecutionLimits } from "@hypit/producer";

import { Executor } from "./executor.js";
import { EndpointRegistry, ProducerRegistry } from "./registry.js";

export type PlanEvaluationBlocker =
  | {
      readonly kind: "external-need";
      readonly step: string;
      readonly port: string;
      readonly need: string;
      readonly record: string;
    }
  | {
      readonly kind: "producer-failure";
      readonly step: string;
      readonly message: string;
    }
  | {
      readonly kind: "missing-producer";
      readonly step: string;
      readonly producer: ProducerRef;
    };

export type PlanRecordSource =
  | { readonly kind: "program-record" }
  | { readonly kind: "producer-output"; readonly step: string; readonly port: string }
  | {
      readonly kind: "need-result";
      readonly step: string;
      readonly port: string;
      readonly need: string;
    };

export type EvaluatedPlanRecord = {
  readonly record: string;
  readonly type: TypeRef;
  readonly source: PlanRecordSource;
  readonly status: "available" | "blocked" | "waiting" | "failed" | "unavailable";
  /** Terminal reasons reached by following this Record's producer dependencies. */
  readonly blockers: readonly PlanEvaluationBlocker[];
};

export type PlanStepDependency = {
  readonly input: string;
  readonly record: string;
  readonly type: TypeRef;
  readonly source: PlanRecordSource;
  readonly status: Exclude<EvaluatedPlanRecord["status"], "available">;
  readonly blockers: readonly PlanEvaluationBlocker[];
};

export type EvaluatedProducerStep = {
  readonly step: string;
  readonly producer: ProducerRef;
} & (
  | { readonly status: "complete" }
  | {
      readonly status: "blocked";
      /** Missing direct input edges. `blockers` carries their transitive terminal causes. */
      readonly dependencies: readonly PlanStepDependency[];
      readonly blockers: readonly PlanEvaluationBlocker[];
    }
  | { readonly status: "failed"; readonly message: string }
  | { readonly status: "unavailable"; readonly message: string }
);

export type ProducerPlanEvaluation = {
  /** Disposable Build view after every currently runnable pure Producer was evaluated once. */
  readonly state: BuildView;
  /** One graph-level result for every Step in the finite BuildPlan. */
  readonly steps: readonly EvaluatedProducerStep[];
  /** Program and produced Record declarations, including values that are not established yet. */
  readonly records: readonly EvaluatedPlanRecord[];
};

type RecordDeclaration = {
  readonly record: string;
  readonly type: TypeRef;
  readonly source: PlanRecordSource;
};

function blockerKey(blocker: PlanEvaluationBlocker): string {
  switch (blocker.kind) {
    case "external-need": return `${blocker.kind}\n${blocker.need}`;
    case "producer-failure": return `${blocker.kind}\n${blocker.step}`;
    case "missing-producer": return `${blocker.kind}\n${blocker.step}`;
  }
}

function uniqueBlockers(blockers: readonly PlanEvaluationBlocker[]): readonly PlanEvaluationBlocker[] {
  const found = new Map<string, PlanEvaluationBlocker>();
  for (const blocker of blockers) found.set(blockerKey(blocker), blocker);
  return [...found.values()];
}

function recordDeclarations(definition: BuildDefinition): readonly RecordDeclaration[] {
  const declarations = new Map<string, RecordDeclaration>();
  for (const record of definition.program.records) {
    declarations.set(record.id, { record: record.id, type: record.type, source: { kind: "program-record" } });
  }
  for (const step of definition.plan.steps) {
    const producer = resolveProducer(definition.program.closure, step.producer);
    if (step.result.kind === "output") {
      const output = producer.result;
      if (output.kind !== "output" || output.name !== step.result.name) throw new Error(`Invalid result for ${step.id}`);
      declarations.set(step.result.record, {
        record: step.result.record,
        type: output.type,
        source: { kind: "producer-output", step: step.id, port: output.name },
      });
    } else {
      const need = producer.result;
      if (need.kind !== "need" || need.name !== step.result.name) throw new Error(`Invalid result for ${step.id}`);
      declarations.set(step.result.record, {
        record: step.result.record,
        type: resolveCapability(definition.program.closure, need.capability).returns,
        source: { kind: "need-result", step: step.id, port: need.name, need: step.result.id },
      });
    }
  }
  return [...declarations.values()];
}

function evaluateGraph(
  definition: BuildDefinition,
  state: BuildView,
  failures: ReadonlyMap<string, string>,
  unavailable: ReadonlyMap<string, string>,
): Pick<ProducerPlanEvaluation, "steps" | "records"> {
  const declarations = recordDeclarations(definition);
  const declarationByRecord = new Map(declarations.map((item) => [item.record, item]));
  const stepById = new Map(definition.plan.steps.map((step) => [step.id, step]));
  const complete = new Set(state.steps.filter((step) => step.status === "complete").map((step) => step.id));
  const available = new Set(state.records.map((record) => record.id));
  const evaluatedRecords = new Map<string, EvaluatedPlanRecord>();
  const evaluatedSteps = new Map<string, EvaluatedProducerStep>();
  const evaluatingRecords = new Set<string>();
  const evaluatingSteps = new Set<string>();

  const evaluateRecord = (record: string): EvaluatedPlanRecord => {
    const cached = evaluatedRecords.get(record);
    if (cached !== undefined) return cached;
    const declaration = declarationByRecord.get(record);
    if (declaration === undefined) throw new Error(`BuildPlan Record ${record} has no declaration`);
    if (available.has(record)) {
      const result: EvaluatedPlanRecord = { ...declaration, status: "available", blockers: [] };
      evaluatedRecords.set(record, result);
      return result;
    }
    if (evaluatingRecords.has(record)) throw new Error(`BuildPlan Record dependency cycle reaches ${record}`);
    evaluatingRecords.add(record);
    let result: EvaluatedPlanRecord;
    if (declaration.source.kind === "program-record") {
      throw new Error(`BuildPlan Program Record ${record} is not available`);
    }
    const owner = evaluateStep(declaration.source.step);
    if (owner.status === "failed") {
      result = {
        ...declaration,
        status: "failed",
        blockers: [{ kind: "producer-failure", step: owner.step, message: owner.message }],
      };
    } else if (owner.status === "unavailable") {
      result = {
        ...declaration,
        status: "unavailable",
        blockers: [{ kind: "missing-producer", step: owner.step, producer: owner.producer }],
      };
    } else if (owner.status === "blocked") {
      result = { ...declaration, status: "blocked", blockers: owner.blockers };
    } else if (declaration.source.kind === "need-result") {
      result = {
        ...declaration,
        status: "waiting",
        blockers: [{
          kind: "external-need",
          step: declaration.source.step,
          port: declaration.source.port,
          need: declaration.source.need,
          record,
        }],
      };
    } else {
      throw new Error(`complete Producer Step ${owner.step} did not establish output Record ${record}`);
    }
    evaluatingRecords.delete(record);
    evaluatedRecords.set(record, result);
    return result;
  };

  const evaluateStep = (stepId: string): EvaluatedProducerStep => {
    const cached = evaluatedSteps.get(stepId);
    if (cached !== undefined) return cached;
    const step = stepById.get(stepId);
    if (step === undefined) throw new Error(`BuildPlan Step ${stepId} does not exist`);
    if (complete.has(stepId)) {
      const result: EvaluatedProducerStep = { step: step.id, producer: step.producer, status: "complete" };
      evaluatedSteps.set(stepId, result);
      return result;
    }
    const failure = failures.get(stepId);
    if (failure !== undefined) {
      const result: EvaluatedProducerStep = { step: step.id, producer: step.producer, status: "failed", message: failure };
      evaluatedSteps.set(stepId, result);
      return result;
    }
    const missing = unavailable.get(stepId);
    if (missing !== undefined) {
      const result: EvaluatedProducerStep = { step: step.id, producer: step.producer, status: "unavailable", message: missing };
      evaluatedSteps.set(stepId, result);
      return result;
    }
    if (evaluatingSteps.has(stepId)) throw new Error(`BuildPlan Step dependency cycle reaches ${stepId}`);
    evaluatingSteps.add(stepId);
    const dependencies = Object.entries(step.inputs).flatMap(([input, record]): PlanStepDependency[] => {
      const evaluated = evaluateRecord(record);
      if (evaluated.status === "available") return [];
      return [{
        input,
        record,
        type: evaluated.type,
        source: evaluated.source,
        status: evaluated.status,
        blockers: evaluated.blockers,
      }];
    });
    evaluatingSteps.delete(stepId);
    if (dependencies.length === 0) {
      throw new Error(`pending Producer Step ${step.id} has no unavailable input and no execution result`);
    }
    const result: EvaluatedProducerStep = {
      step: step.id,
      producer: step.producer,
      status: "blocked",
      dependencies,
      blockers: uniqueBlockers(dependencies.flatMap((dependency) => dependency.blockers)),
    };
    evaluatedSteps.set(stepId, result);
    return result;
  };

  for (const step of definition.plan.steps) evaluateStep(step.id);
  for (const declaration of declarations) evaluateRecord(declaration.record);
  return {
    steps: definition.plan.steps.map((step) => evaluatedSteps.get(step.id)!),
    records: declarations.map((declaration) => evaluatedRecords.get(declaration.record)!),
  };
}

/**
 * Evaluate the closed Build graph without installing any Endpoint.
 *
 * Component Producers are deterministic computation. External Needs remain blocked, while every
 * independent Producer keeps advancing. A failed Producer is attempted once: planning reports the
 * failure instead of looping or turning it into a Build fact.
 */
export async function evaluateProducerPlan(
  definition: BuildDefinition,
  producers: ProducerRegistry,
  refinements: RefinementRegistryLike = new RefinementRegistry(),
  producerExecutionLimits?: ProducerExecutionLimits,
): Promise<ProducerPlanEvaluation> {
  const driver = new Executor({ producers, endpoints: new EndpointRegistry(), refinements,
    ...(producerExecutionLimits === undefined ? {} : { producerExecutionLimits }) });
  const machine = new BuildMachine(definition);
  const attempted = new Set<string>();
  const failures = new Map<string, string>();

  while (true) {
    const prepared = driver.prepare(machine);
    const runnable = prepared.runnable.filter((item) =>
      item.command.kind === "invoke-producer" && !attempted.has(item.command.id));
    if (runnable.length === 0) break;

    for (const descriptor of runnable) {
      if (descriptor.command.kind !== "invoke-producer") continue;
      attempted.add(descriptor.command.id);
      try {
        const result = await driver.executeCommand(machine, descriptor, { build: "plan" });
        if (result.status !== "completed") {
          failures.set(descriptor.command.step, "the Producer did not complete synchronously");
          continue;
        }
        if (result.event.kind === "command-failed") {
          failures.set(descriptor.command.step, result.event.message);
          continue;
        }
        machine.evaluate(result.event);
        machine.commit();
      } catch (error) {
        failures.set(descriptor.command.step, error instanceof Error ? error.message : String(error));
      }
    }
  }

  const final = driver.prepare(machine);
  const unavailable = new Map<string, string>();
  for (const blocked of final.blocked) {
    if (blocked.reason !== "missing-producer") continue;
    unavailable.set(blocked.step, `no Producer for ${blocked.subject} is loaded`);
  }

  const state = machine.view();
  return { state, ...evaluateGraph(definition, state, failures, unavailable) };
}
