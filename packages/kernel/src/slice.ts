import { moduleKey } from "@hypit/protocol";
import type {
  AuthorGraph,
  GraphValueRef,
  LinkedProgram,
  ModuleRef,
  RunGraph,
} from "@hypit/protocol";

import { createResolvedClosure, link } from "./link.js";
import { verifyBuildPlan } from "./plan.js";
import type { BuildCandidateSelection, PlannedExecution } from "./plan.js";

/**
 * Materialize exactly the execution selected by one Author Graph and one Run Graph.
 *
 * Candidate choice is Core semantics: once an alternate Candidate satisfies an
 * output, only that Candidate's reachable upstream graph survives. Hosts must
 * not reproduce this traversal independently.
 */
export function sliceExecution(
  program: LinkedProgram,
  authorGraph: AuthorGraph,
  runGraph: RunGraph,
  selected: PlannedExecution,
): {
  readonly program: LinkedProgram;
  readonly plan: PlannedExecution["plan"];
  readonly initialRecords: PlannedExecution["initialRecords"];
  readonly selectedSupplies: PlannedExecution["selectedSupplies"];
  readonly targets: RunGraph["targets"];
  readonly selections: readonly BuildCandidateSelection[];
} {
  const graph = {
    format: "hypit.graph@1" as const,
    outputs: authorGraph.outputs,
    candidates: [...authorGraph.candidates, ...runGraph.candidates],
    operations: [...authorGraph.operations, ...runGraph.operations],
  };
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
    if (candidate.root.kind === "operation") visitOperation(candidate.root.result.operation);
  };
  const visitOutput = (id: string): void => {
    if (outputs.has(id)) return;
    const output = outputById.get(id);
    if (output === undefined) throw new Error(`execution slice refers to absent Logical Output ${id}`);
    outputs.add(id);
    visitCandidate(selectionByOutput.get(id)?.candidate ?? output.primary);
  };
  runGraph.targets.forEach(visitOutput);

  const selectedOperations = graph.operations.filter((item) => operations.has(item.id));
  const authoredRecords = program.records.filter((record) => records.has(record.id));
  const executionSelections = selected.selections.filter((item) => outputs.has(item.output));
  const targetRecords = new Set<string>();
  for (const target of runGraph.targets) {
    const selection = selectionByOutput.get(target);
    const output = outputById.get(target);
    if (selection === undefined || output === undefined) {
      throw new Error(`execution slice has no selected source for ${target}`);
    }
    targetRecords.add(selection.record);
  }
  const goals = [...targetRecords].sort();
  const requiredRecords = new Set([
    ...goals,
    ...selected.plan.steps
      .filter((step) => operations.has(step.id))
      .flatMap((step) => Object.values(step.inputs)),
  ]);
  const initialRecords = selected.initialRecords.filter((record) => requiredRecords.has(record.id));
  const selectedSupplies = selected.selectedSupplies.filter((supply) =>
    candidates.has(supply.candidate) && requiredRecords.has(supply.record));
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
  initialRecords.forEach((item) => requireModule(item.type.module));
  selectedSupplies.forEach((item) => requireModule(item.type.module));
  authoredRecords.forEach((item) => requireModule(item.type.module));

  const closure = createResolvedClosure(program.closure.modules
    .filter((item) => requiredModules.has(moduleKey(item))));
  const slicedProgram = link(closure, authoredRecords);
  verifyBuildPlan(slicedProgram, [
    ...initialRecords,
    ...selectedSupplies.map((supply) => ({ id: supply.record, type: supply.type })),
  ], plan);
  return {
    program: slicedProgram,
    plan,
    initialRecords,
    selectedSupplies,
    targets: runGraph.targets,
    selections: executionSelections,
  };
}
