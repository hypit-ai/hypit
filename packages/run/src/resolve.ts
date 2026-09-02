import {
  elaborateGraphFragment,
  exportRunFragment,
  resolveCompiledSourceExport,
} from "@hypit/elaborator";
import { sameType } from "@hypit/protocol";
import type {
  Candidate,
  GraphValueRef,
  ModuleRef,
  OperationNode,
} from "@hypit/protocol";
import {
  createProvidedCandidate,
} from "./candidate.js";

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
    if (declaration.kind === "file") {
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

/** Resolve both source graph structures before Core derives a finite BuildPlan. */
export async function resolveRunDocument(
  document: RunDocument,
  context: ResolveRunDocumentContext,
): Promise<RunCompilation> {
  const imports = new Map(document.imports.map((item) => [item.as, item.from]));
  const candidates = new Map<string, Candidate>();
  const operations = new Map<string, OperationNode>();
  const addCandidate = (candidate: Candidate): void => {
    if (candidates.has(candidate.id)) throw new Error(`Run Candidate ${candidate.id} is declared twice`);
    candidates.set(candidate.id, candidate);
  };
  const addOperation = (operation: OperationNode): void => {
    if (operations.has(operation.id)) throw new Error(`Run Operation ${operation.id} is declared twice`);
    operations.set(operation.id, operation);
  };
  const candidateNames = new Map<string, string>();
  const candidateSources = new Map<string, RunCompilation["candidateSources"][string]>();
  const declarationIds = new Set<string>();
  const bindCandidateName = (name: string, candidate: string): void => {
    if (candidateNames.has(name)) throw new Error(`Run Candidate reference ${name} is declared twice`);
    candidateNames.set(name, candidate);
  };

  for (const declaration of document.candidates) {
    if (declarationIds.has(declaration.id)) throw new Error(`Run Candidate ${declaration.id} is declared twice`);
    declarationIds.add(declaration.id);
    if (declaration.kind === "provided") {
      const candidate = createProvidedCandidate({
        id: declaration.id,
        type: declaration.type,
        value: { kind: "inline", value: null },
      });
      addCandidate(candidate);
      bindCandidateName(declaration.id, candidate.id);
      candidateSources.set(candidate.id, { kind: "stored-value", from: declaration.from });
      continue;
    }
    if (declaration.kind === "file") {
      const candidate = createProvidedCandidate({
        id: declaration.id,
        type: declaration.type,
        value: { kind: "inline", value: null },
      });
      addCandidate(candidate);
      bindCandidateName(declaration.id, candidate.id);
      candidateSources.set(candidate.id, {
        kind: "file",
        from: declaration.from,
        mediaType: declaration.mediaType,
      });
      continue;
    }
    if (declaration.kind === "build-record") {
      const destinations = document.satisfactions
        .filter((item) => item.candidate === declaration.id)
        .map((item) => resolveCompiledSourceExport(context.compilation, item.output));
      if (destinations.length === 0) continue;
      const type = destinations[0]!.type;
      for (const destination of destinations) {
        if (destination.ref.kind !== "logical-output") {
          throw new Error(`${declaration.id} satisfies an authored Record rather than a Logical Output`);
        }
        if (!sameType(destination.type, type)) {
          throw new Error(`Historical Candidate ${declaration.id} is used for incompatible Logical Output types`);
        }
      }
      const candidate = createProvidedCandidate({ id: declaration.id, type, value: { kind: "inline", value: null } });
      addCandidate(candidate);
      bindCandidateName(declaration.id, candidate.id);
      candidateSources.set(candidate.id, {
        kind: "build-output",
        build: declaration.build,
        output: declaration.output,
      });
      continue;
    }
    const packageName = imports.get(declaration.using.alias);
    if (packageName === undefined) throw new Error(`Run Fragment alias ${declaration.using.alias} is not imported`);
    const fragment = context.fragments.resolve(packageName, declaration.using.name);
    if (fragment === undefined) {
      throw new Error(`${packageName} exports no Run Fragment ${declaration.using.name}`);
    }
    const instance = elaborateGraphFragment(context.compilation.program, fragment, {
      id: `run:${declaration.id}`,
      fragment: fragment.id,
      inputs: Object.fromEntries(declaration.inputs.map((item) => [item.name, authorRef(context, item.from)])),
    });
    const contribution = exportRunFragment(instance, declaration.exports);
    for (const candidate of contribution.candidates) addCandidate(candidate);
    for (const operation of contribution.operations) addOperation(operation);
    for (const item of contribution.exports) bindCandidateName(`${declaration.id}.${item.name}`, item.candidate);
  }

  const satisfactionNames = new Map<string, string>();
  const satisfactions = document.satisfactions.map((item) => {
    const candidate = candidateNames.get(item.candidate);
    if (candidate === undefined) throw new Error(`Unknown Run Candidate ${item.candidate}`);
    const output = logicalOutput(context, item.output);
    if (satisfactionNames.has(output)) {
      throw new Error(`Logical Output ${item.output} is satisfied more than once`);
    }
    satisfactionNames.set(output, item.candidate);
    return {
      output,
      candidate,
    } as const;
  });
  const targets = document.targets.map((item) => ({ output: logicalOutput(context, item.output) }));
  const resolvedCandidates = [...candidates.values()];
  const resolvedOperations = [...operations.values()];
  const graph = sealRunGraph({
    candidates: resolvedCandidates,
    operations: resolvedOperations,
    satisfactions,
    targets,
  });
  return {
    document,
    graph,
    candidates: Object.fromEntries([...candidateNames.entries()].sort(([left], [right]) => left.localeCompare(right))),
    candidateSources: Object.fromEntries([...candidateSources.entries()].sort(([left], [right]) => left.localeCompare(right))),
    satisfactionNames: Object.fromEntries([...satisfactionNames.entries()].sort(([left], [right]) => left.localeCompare(right))),
  };
}
