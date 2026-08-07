import {
  elaborateGraphFragment,
  exportRunFragment,
  resolveCompiledSourceExport,
} from "@svml/elaborator";
import { canonicalStringify } from "@svml/protocol";
import type {
  Candidate,
  GraphValueRef,
  ModuleRef,
  OperationNode,
  StoredValue,
} from "@svml/protocol";
import {
  createBuildRecordCandidate,
  createProvidedCandidate,
  sealRealizationOverlay,
} from "@svml/realization";

import { sealRunGraph } from "./graph.js";

import type {
  ResolveRunDocumentContext,
  RunCompilation,
  RunDocument,
} from "./types.js";

function moduleRequest(ref: ModuleRef): string {
  return `${ref.name}@${ref.version}`;
}

/** Module closure additions required only by the selected Run implementations. */
export function collectRunModuleRequests(
  document: RunDocument,
  fragments: ResolveRunDocumentContext["fragments"],
): readonly string[] {
  const imports = new Map(document.imports.map((item) => [item.as, item.from]));
  const requests = new Set<string>();
  for (const declaration of document.candidates) {
    if (declaration.kind === "provided") {
      requests.add(moduleRequest(declaration.type.module));
      continue;
    }
    if (declaration.kind !== "fragment") continue;
    const packageName = imports.get(declaration.using.alias);
    if (packageName === undefined) throw new Error(`Run Fragment alias ${declaration.using.alias} is not imported`);
    const fragment = fragments.resolve(packageName, declaration.using.name);
    if (fragment === undefined) throw new Error(`${packageName} exports no Run Fragment ${declaration.using.name}`);
    for (const input of fragment.inputs) requests.add(moduleRequest(input.type.module));
    for (const operation of fragment.operations) requests.add(moduleRequest(operation.producer.module));
    for (const item of fragment.exports) requests.add(moduleRequest(item.type.module));
  }
  return [...requests].sort();
}

function authorRef(context: ResolveRunDocumentContext, name: string): GraphValueRef {
  const exported = resolveCompiledSourceExport(context.compilation, name);
  return exported.ref;
}

function logicalOutput(context: ResolveRunDocumentContext, name: string): string {
  const exported = resolveCompiledSourceExport(context.compilation, name);
  if (exported.ref.kind !== "logical-output") {
    throw new Error(`${name} is an authored Record, not a realizable Logical Output`);
  }
  return exported.ref.id;
}

function assertStoredValue(value: unknown, subject: string): asserts value is StoredValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${subject} must contain one StoredValue object`);
  }
  const item = value as Record<string, unknown>;
  if (item.kind === "inline" && Object.hasOwn(item, "value")) return;
  if (item.kind === "blob"
    && typeof item.digest === "string"
    && Number.isSafeInteger(item.size)
    && typeof item.mediaType === "string") return;
  throw new Error(`${subject} is not an inline or blob StoredValue`);
}

/** Resolve both source graphs completely before Core derives a finite BuildPlan. */
export async function resolveRunDocument(
  document: RunDocument,
  context: ResolveRunDocumentContext,
): Promise<RunCompilation> {
  const imports = new Map(document.imports.map((item) => [item.as, item.from]));
  const candidates = new Map<string, Candidate>();
  const operations = new Map<string, OperationNode>();
  const addCandidate = (candidate: Candidate): void => {
    const existing = candidates.get(candidate.id);
    if (existing !== undefined && canonicalStringify(existing) !== canonicalStringify(candidate)) {
      throw new Error(`Run Candidate identity ${candidate.id} has conflicting definitions`);
    }
    candidates.set(candidate.id, candidate);
  };
  const addOperation = (operation: OperationNode): void => {
    const existing = operations.get(operation.id);
    if (existing !== undefined && canonicalStringify(existing) !== canonicalStringify(operation)) {
      throw new Error(`Run Operation identity ${operation.id} has conflicting definitions`);
    }
    operations.set(operation.id, operation);
  };
  const candidateNames = new Map<string, string>();
  const bindCandidateName = (name: string, candidate: string): void => {
    if (candidateNames.has(name)) throw new Error(`Run Candidate reference ${name} is declared twice`);
    candidateNames.set(name, candidate);
  };

  for (const declaration of document.candidates) {
    if (declaration.kind === "provided") {
      const value = await context.readStoredValue(declaration.from);
      assertStoredValue(value, declaration.from);
      const candidate = createProvidedCandidate({ type: declaration.type, value });
      addCandidate(candidate);
      bindCandidateName(declaration.id, candidate.id);
      continue;
    }
    if (declaration.kind === "build-record") {
      const build = await context.readBuild(declaration.build);
      if (build === undefined) throw new Error(`Build ${declaration.build} does not exist`);
      const candidate = createBuildRecordCandidate({
        build,
        sourceOutput: declaration.output,
      });
      addCandidate(candidate);
      bindCandidateName(declaration.id, candidate.id);
      continue;
    }
    const packageName = imports.get(declaration.using.alias);
    if (packageName === undefined) throw new Error(`Run Fragment alias ${declaration.using.alias} is not imported`);
    const fragment = context.fragments.resolve(packageName, declaration.using.name);
    if (fragment === undefined) {
      throw new Error(`${packageName} exports no Run Fragment ${declaration.using.name}`);
    }
    const instance = elaborateGraphFragment(context.compilation.program, fragment, {
      id: declaration.id,
      fragment: fragment.id,
      inputs: Object.fromEntries(declaration.inputs.map((item) => [item.name, authorRef(context, item.from)])),
    });
    const contribution = exportRunFragment(instance, declaration.exports);
    for (const candidate of contribution.candidates) addCandidate(candidate);
    for (const operation of contribution.operations) addOperation(operation);
    for (const item of contribution.exports) bindCandidateName(`${declaration.id}.${item.name}`, item.candidate);
  }

  const satisfactions = document.satisfactions.map((item) => {
    const candidate = candidateNames.get(item.candidate);
    if (candidate === undefined) throw new Error(`Unknown Run Candidate ${item.candidate}`);
    return {
      output: logicalOutput(context, item.output),
      candidate,
      fidelity: item.fidelity,
    } as const;
  });
  const targetSets = document.targetSets.map((set) => ({
    id: set.id,
    targets: set.targets.map((item) => ({
      output: logicalOutput(context, item.output),
      accepts: item.accepts,
    })),
  }));
  const resolvedCandidates = [...candidates.values()];
  const resolvedOperations = [...operations.values()];
  const overlay = resolvedCandidates.length === 0
    ? undefined
    : sealRealizationOverlay({
      sourceGraph: context.compilation.elaboration.graph.id,
      candidates: resolvedCandidates,
      operations: resolvedOperations,
    });
  const graph = sealRunGraph({
    authorGraph: context.compilation.elaboration.graph.id,
    sourceClosure: context.sourceClosure.id,
    candidates: resolvedCandidates,
    operations: resolvedOperations,
    satisfactions,
    targetSets,
    selectedTargets: document.selectedTargets,
  });
  return {
    closure: context.sourceClosure,
    document,
    graph,
    ...(overlay === undefined ? {} : { overlay }),
    candidates: Object.fromEntries([...candidateNames.entries()].sort(([left], [right]) => left.localeCompare(right))),
  };
}
