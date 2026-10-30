import { moduleKey } from "@hypit/protocol";
import type {
  LinkedProgram,
  ModuleRef,
} from "@hypit/protocol";

import { createResolvedClosure, link } from "./link.js";
import { verifyBuildPlan } from "./plan.js";
import type { PlannedExecution } from "./plan.js";

/** Fixed public value exposed after execution slicing. */
export type ResolvedOutputRecord = {
  readonly output: string;
  readonly record: string;
};

/**
 * Materialize exactly the finite execution reached by one Target selection.
 */
export function sliceExecution(
  program: LinkedProgram,
  targets: readonly string[],
  selected: PlannedExecution,
): {
  readonly program: LinkedProgram;
  readonly plan: PlannedExecution["plan"];
  readonly targets: readonly string[];
  readonly outputs: readonly ResolvedOutputRecord[];
} {
  const recordByOutput = new Map(selected.outputs.map((item) => [item.output, item]));
  const recordIds = new Set([
    ...selected.plan.steps.flatMap((step) => Object.values(step.inputs)),
    ...selected.plan.goals,
  ]);
  const authoredRecords = program.records.filter((record) => recordIds.has(record.id));
  const executionOutputs = selected.outputs
    .filter((item) => recordByOutput.has(item.output))
    .map(({ output, record }) => ({ output, record }));
  const targetRecords = new Set<string>();
  for (const target of targets) {
    const output = recordByOutput.get(target);
    if (output === undefined) {
      throw new Error(`execution slice has no resolved value for ${target}`);
    }
    targetRecords.add(output.record);
  }
  const goals = [...targetRecords].sort();
  const plan: PlannedExecution["plan"] = {
    format: "hypit.plan@1",
    steps: selected.plan.steps,
    goals,
  };

  const requiredModules = new Set<string>();
  const modulesByKey = new Map(program.closure.modules.map((item) => [moduleKey(item), item]));
  const requireModule = (ref: ModuleRef): void => {
    const key = moduleKey(ref);
    if (requiredModules.has(key)) return;
    const resolved = modulesByKey.get(key);
    if (resolved === undefined) throw new Error(`execution slice refers to absent module ${key}`);
    requiredModules.add(key);
    resolved.dependencies.forEach(requireModule);
  };
  selected.plan.steps.forEach((item) => requireModule(item.producer.module));
  authoredRecords.forEach((item) => requireModule(item.type.module));

  const closure = createResolvedClosure(program.closure.modules
    .filter((item) => requiredModules.has(moduleKey(item))));
  const slicedProgram = link(closure, authoredRecords);
  verifyBuildPlan(slicedProgram, plan);
  return {
    program: slicedProgram,
    plan,
    targets,
    outputs: executionOutputs,
  };
}
