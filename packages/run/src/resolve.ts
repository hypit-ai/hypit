import {
  elaborateGraphFragment,
  exportRunFragment,
  resolveCompiledSourceExport,
} from "@svml/elaborator";
import type { GraphValueRef, StoredValue } from "@svml/protocol";
import {
  createBuildRecordCandidate,
  createProvidedCandidate,
  sealRunGraph,
} from "@svml/realization";

import type {
  ResolveRunDocumentContext,
  ResolvedRunDocument,
  RunDocument,
} from "./types.js";

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
): Promise<ResolvedRunDocument> {
  const imports = new Map(document.imports.map((item) => [item.as, item.from]));
  const candidates = [];
  const operations = [];
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
      candidates.push(candidate);
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
      candidates.push(candidate);
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
    candidates.push(...contribution.candidates);
    operations.push(...contribution.operations);
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
  const selected = document.targetSets.find((item) => item.id === document.selectedTargets)!;
  const graphs = candidates.length === 0
    ? []
    : [sealRunGraph({
        sourceGraph: context.compilation.elaboration.graph.id,
        candidates,
        operations,
      })];
  return {
    source: document.source,
    targets: selected.targets.map((item) => ({ name: item.output, accepts: item.accepts })),
    graphs,
    satisfactions,
    candidates: Object.fromEntries([...candidateNames.entries()].sort(([left], [right]) => left.localeCompare(right))),
  };
}
