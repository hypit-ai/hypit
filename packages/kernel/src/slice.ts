import { moduleKey } from "@hypit/protocol";
import type {
  AuthorGraph,
  GraphValueRef,
  LinkedProgram,
  ModuleRef,
} from "@hypit/protocol";

import { createResolvedClosure, link } from "./link.js";
import { verifyBuildPlan } from "./plan.js";
import type { PlannedExecution } from "./plan.js";

/** Candidate-free selected value exposed after execution slicing. */
export type SelectedOutputRecord = {
  readonly output: string;
  readonly record: string;
};

/**
 * Materialize exactly the execution selected from one Author Graph by one Invocation.
 *
 * Candidate choice is Core semantics: once an alternate Candidate satisfies an
 * output, only that Candidate's reachable upstream graph survives. Hosts must
 * not reproduce this traversal independently.
 */
export function sliceExecution(
  program: LinkedProgram,
  authorGraph: AuthorGraph,
  targets: readonly string[],
  selected: PlannedExecution,
): {
  readonly program: LinkedProgram;
  readonly plan: PlannedExecution["plan"];
  readonly targets: readonly string[];
  readonly selections: readonly SelectedOutputRecord[];
} {
  const graph = authorGraph;
  const outputById = new Map(authorGraph.outputs.map((item) => [item.id, item]));
  const candidateById = new Map(graph.candidates.map((item) => [item.id, item]));
  const operationById = new Map(graph.operations.map((item) => [item.id, item]));
  const selectionByOutput = new Map(selected.selections.map((item) => [item.output, item]));
  const outputs = new Set<string>();
  const candidates = new Set<string>();
  const operations = new Set<string>();
  const records = new Set<string>();

  const visitRef = (ref: GraphValueRef): void => {
    if (ref.kind === "record") records.add(ref.id);
    else if (ref.kind === "logical-output") visitOutput(ref.id);
    else visitOperation(ref.operation);
  };
  const visitOperation = (id: string): void => {
    if (operations.has(id)) return;
    const operation = operationById.get(id);
    if (operation === undefined) throw new Error(`execution slice refers to absent Operation ${id}`);
    operations.add(id);
    Object.values(operation.inputs).forEach(visitRef);
  };
  const visitCandidate = (id: string): void => {
    if (candidates.has(id)) return;
    const candidate = candidateById.get(id);
    if (candidate === undefined) throw new Error(`execution slice refers to absent Candidate ${id}`);
    candidates.add(id);
    if (candidate.root.kind === "record") records.add(candidate.root.id);
    else visitOperation(candidate.root.operation);
  };
  const visitOutput = (id: string): void => {
    if (outputs.has(id)) return;
    const output = outputById.get(id);
    if (output === undefined) throw new Error(`execution slice refers to absent Logical Output ${id}`);
    outputs.add(id);
    visitCandidate(selectionByOutput.get(id)?.candidate ?? output.primary);
  };
  targets.forEach(visitOutput);

  const selectedOperations = graph.operations.filter((item) => operations.has(item.id));
  const authoredRecords = program.records.filter((record) => records.has(record.id));
  const executionSelections = selected.selections
    .filter((item) => outputs.has(item.output))
    .map(({ output, record }) => ({ output, record }));
  const targetRecords = new Set<string>();
  for (const target of targets) {
    const selection = selectionByOutput.get(target);
    const output = outputById.get(target);
    if (selection === undefined || output === undefined) {
      throw new Error(`execution slice has no selected source for ${target}`);
    }
    targetRecords.add(selection.record);
  }
  const goals = [...targetRecords].sort();
  const plan: PlannedExecution["plan"] = {
    format: "hypit.plan@1",
    steps: selected.plan.steps.filter((step) => operations.has(step.id)),
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
  selectedOperations.forEach((item) => requireModule(item.producer.module));
  authoredRecords.forEach((item) => requireModule(item.type.module));

  const closure = createResolvedClosure(program.closure.modules
    .filter((item) => requiredModules.has(moduleKey(item))));
  const slicedProgram = link(closure, authoredRecords);
  verifyBuildPlan(slicedProgram, plan);
  return {
    program: slicedProgram,
    plan,
    targets,
    selections: executionSelections,
  };
}
