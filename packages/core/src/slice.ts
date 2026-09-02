import type {
  CompiledGraph,
  GraphValueRef,
  LinkedProgram,
  ModuleRef,
  RunGraph,
} from "@hypit/protocol";

import { createResolvedClosure, link } from "./link.js";
import { planBuild } from "./plan.js";
import type { BuildCandidateSelection } from "./plan.js";

function moduleKey(ref: ModuleRef): string {
  return `${ref.name}\u0000${ref.version}`;
}

/**
 * Materialize exactly the execution selected by one Author Graph and one Run Graph.
 *
 * Candidate choice is Core semantics: once an alternate Candidate satisfies an
 * output, only that Candidate's reachable upstream graph survives. Hosts must
 * not reproduce this traversal independently.
 */
export function sliceExecution(
  program: LinkedProgram,
  authorGraph: CompiledGraph,
  runGraph: RunGraph,
): {
  readonly program: LinkedProgram;
  readonly plan: ReturnType<typeof planBuild>["plan"];
  readonly initialRecords: ReturnType<typeof planBuild>["initialRecords"];
  readonly targets: RunGraph["targets"];
  readonly selections: readonly BuildCandidateSelection[];
} {
  const preliminary = planBuild(program, authorGraph, runGraph);
  const graph = {
    format: "hypit.graph@1" as const,
    outputs: authorGraph.outputs,
    candidates: [...authorGraph.candidates, ...runGraph.candidates],
    operations: [...authorGraph.operations, ...runGraph.operations],
  };
  const outputById = new Map(authorGraph.outputs.map((item) => [item.id, item]));
  const candidateById = new Map(graph.candidates.map((item) => [item.id, item]));
  const operationById = new Map(graph.operations.map((item) => [item.id, item]));
  const selectionByOutput = new Map(preliminary.selections.map((item) => [item.output, item]));
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
  runGraph.targets.forEach((target) => visitOutput(target.output));

  const selectedOperations = graph.operations.filter((item) => operations.has(item.id));
  const authoredRecords = program.records.filter((record) => records.has(record.id));

  const requiredModules = new Set<string>();
  const modulesByKey = new Map(program.closure.modules.map((item) => [moduleKey(item.manifest), item]));
  const requireModule = (ref: ModuleRef): void => {
    const key = moduleKey(ref);
    if (requiredModules.has(key)) return;
    const resolved = modulesByKey.get(key);
    if (resolved === undefined) throw new Error(`execution slice refers to absent module ${ref.name}@${ref.version}`);
    requiredModules.add(key);
    resolved.manifest.dependencies.forEach((item) => requireModule(item.module));
  };
  selectedOperations.forEach((item) => requireModule(item.producer.module));
  preliminary.plan.outputBindings.forEach((item) => requireModule(item.type.module));
  preliminary.initialRecords.forEach((item) => requireModule(item.type.module));
  authoredRecords.forEach((item) => requireModule(item.type.module));

  const closure = createResolvedClosure(program.closure.modules
    .filter((item) => requiredModules.has(moduleKey(item.manifest)))
    .map((item) => item.manifest));
  const slicedProgram = link(closure, authoredRecords);
  return {
    program: slicedProgram,
    plan: preliminary.plan,
    initialRecords: preliminary.initialRecords,
    targets: runGraph.targets,
    selections: preliminary.selections,
  };
}
