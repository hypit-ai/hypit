import {
  canonicalize,
  digestOf,
  EMPTY_REALIZATION_DIGEST,
  isDigest,
  sealOutputValidationReceipt,
  resolveLogicalOutput,
  sealCompiledGraph,
  verifyBuildState,
  verifyCompiledGraph,
} from "@svml/core";
import type {
  BuildState,
  Candidate,
  CanonicalValue,
  CompiledGraph,
  Conformance,
  Digest,
  LinkedProgram,
  OperationNode,
  StoredValue,
  TypeValidationReceipt,
  OutputValidationReceipt,
} from "@svml/protocol";

export type RealizationOverlay = {
  readonly format: "svml.realization-overlay@1";
  readonly id: Digest;
  /** Exact author graph to which these Candidates may be attached. */
  readonly sourceGraph: Digest;
  readonly candidates: readonly Candidate[];
  readonly operations: readonly OperationNode[];
};

export type RealizationClosure = {
  readonly format: "svml.realization-closure@1";
  readonly id: Digest;
  readonly sourceGraph: Digest;
  readonly overlays: readonly Digest[];
};

export type ResolvedRealization = {
  readonly closure: RealizationClosure;
  readonly graph: CompiledGraph;
};

export type ProvidedCandidateInput = {
  readonly output: string;
  readonly value: StoredValue;
  readonly fidelity: Conformance;
  readonly record?: string;
  readonly provenance?: CanonicalValue;
  readonly validation?: TypeValidationReceipt;
  readonly outputValidation?: OutputValidationReceipt;
};

export type HistoricalCandidateInput = {
  /** Current author graph before any external Realization Overlay. */
  readonly source: CompiledGraph;
  /** A previously verified BuildState using this exact author graph source. */
  readonly build: BuildState;
  readonly output: string;
};

export class RealizationError extends Error {
  readonly code: string;
  readonly subject: string | undefined;

  constructor(code: string, message: string, subject?: string) {
    super(message);
    this.name = "RealizationError";
    this.code = code;
    this.subject = subject;
  }
}

function assert(condition: unknown, code: string, message: string, subject?: string): asserts condition {
  if (!condition) throw new RealizationError(code, message, subject);
}

function overlayContent(overlay: RealizationOverlay): Omit<RealizationOverlay, "id"> {
  return {
    format: "svml.realization-overlay@1",
    sourceGraph: overlay.sourceGraph,
    candidates: [...overlay.candidates].sort((left, right) => left.id.localeCompare(right.id)),
    operations: [...overlay.operations].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function sealRealizationOverlay(
  overlay: Omit<RealizationOverlay, "format" | "id">,
): RealizationOverlay {
  const draft = {
    format: "svml.realization-overlay@1" as const,
    id: digestOf("unsealed-realization-overlay"),
    ...overlay,
  };
  const content = overlayContent(draft);
  assert(content.candidates.length > 0, "EMPTY_REALIZATION_OVERLAY", "Realization Overlay has no Candidates");
  return { ...content, id: digestOf(content) };
}

export function createProvidedCandidate(input: ProvidedCandidateInput): Candidate {
  assert(input.output.length > 0, "EMPTY_LOGICAL_OUTPUT_ID", "Provided Candidate output is empty");
  assert(
    input.fidelity === "exact" || input.fidelity === "substitute",
    "INVALID_CONFORMANCE",
    "Provided Candidate fidelity is invalid",
  );
  const value = input.value.kind === "inline"
    ? { kind: "inline" as const, value: canonicalize(input.value.value) }
    : { ...input.value };
  const identity = {
    kind: "provided-candidate@1",
    output: input.output,
    value,
    fidelity: input.fidelity,
    ...(input.provenance === undefined ? {} : { provenance: canonicalize(input.provenance) }),
    ...(input.validation === undefined ? {} : { validation: input.validation }),
    ...(input.outputValidation === undefined ? {} : { outputValidation: input.outputValidation }),
  };
  const suffix = digestOf(identity).slice("sha256:".length);
  return {
    id: `candidate:${suffix}`,
    output: input.output,
    root: {
      kind: "value",
      value: {
        id: input.record ?? `provided:${suffix}`,
        value,
        ...(input.provenance === undefined ? {} : { provenance: canonicalize(input.provenance) }),
        ...(input.validation === undefined ? {} : { validation: input.validation }),
        ...(input.outputValidation === undefined ? {} : { outputValidation: input.outputValidation }),
      },
    },
    fidelity: input.fidelity,
  };
}

/**
 * Admit one already verified historical Logical Output as an inert Existing Value Candidate.
 * The new Build is unrelated to recovery: only the exact Record value and its admission receipt
 * cross the boundary. No prior outstanding Command or execution state is reused.
 */
export function createHistoricalCandidate(input: HistoricalCandidateInput): Candidate {
  verifyCompiledGraph(input.build.program, input.source);
  verifyBuildState(input.build);
  assert(
    input.build.graph.source === input.source.source,
    "HISTORICAL_GRAPH_MISMATCH",
    "historical Build belongs to another author graph source",
    input.output,
  );
  const currentOutput = resolveLogicalOutput(input.source, input.output);
  const historicalOutput = resolveLogicalOutput(input.build.graph, input.output);
  assert(
    digestOf({
      id: currentOutput.id,
      type: currentOutput.type,
      semanticInputs: currentOutput.semanticInputs,
      affinity: currentOutput.affinity ?? [],
    }) === digestOf({
      id: historicalOutput.id,
      type: historicalOutput.type,
      semanticInputs: historicalOutput.semanticInputs,
      affinity: historicalOutput.affinity ?? [],
    }),
    "HISTORICAL_OUTPUT_MISMATCH",
    "historical Build has another Logical Output definition",
    input.output,
  );
  const selection = input.build.plan.selections.find((item) => item.output === input.output);
  assert(selection !== undefined, "HISTORICAL_OUTPUT_UNSELECTED", "historical Build did not select this Logical Output", input.output);
  const record = input.build.records.find((item) => item.id === selection.record);
  assert(record !== undefined, "HISTORICAL_RECORD_MISSING", "historical Output Record is absent", selection.record);
  assert(
    record.type.module.name === currentOutput.type.module.name
      && record.type.module.version === currentOutput.type.module.version
      && record.type.name === currentOutput.type.name,
    "HISTORICAL_TYPE_MISMATCH",
    "historical Output Record has another Type",
    record.id,
  );
  const outputValidation = record.conformance === "exact"
    ? sealOutputValidationReceipt({
        graphSource: input.source.source,
        output: input.output,
        recordDigest: record.digest,
        sourceBuild: input.build.id,
        sourceRequest: input.build.request.digest,
        sourceCandidate: selection.candidate,
      })
    : undefined;
  return createProvidedCandidate({
    output: input.output,
    value: record.value,
    fidelity: record.conformance,
    provenance: {
      format: "svml.historical-output@1",
      sourceBuild: input.build.id,
      sourceRequest: input.build.request.digest,
      sourceCandidate: selection.candidate,
      sourceRecord: record.id,
      sourceRecordDigest: record.digest,
    },
    ...(record.validation === undefined ? {} : { validation: record.validation }),
    ...(outputValidation === undefined ? {} : { outputValidation }),
  });
}

export function verifyRealizationOverlay(
  program: LinkedProgram,
  source: CompiledGraph,
  overlay: RealizationOverlay,
): void {
  verifyCompiledGraph(program, source);
  assert(
    source.realization === EMPTY_REALIZATION_DIGEST,
    "OVERLAY_REQUIRES_AUTHOR_GRAPH",
    "Realization Overlays attach to an author graph, not an already realized graph",
  );
  assert(overlay.format === "svml.realization-overlay@1", "UNSUPPORTED_REALIZATION_OVERLAY", "unsupported Overlay format");
  assert(isDigest(overlay.id), "INVALID_OVERLAY_DIGEST", "Realization Overlay id is not a digest");
  assert(overlay.id === digestOf(overlayContent(overlay)), "OVERLAY_DIGEST_MISMATCH", "Realization Overlay digest differs");
  assert(overlay.sourceGraph === source.id, "OVERLAY_SOURCE_MISMATCH", "Realization Overlay targets another author graph");
  assert(overlay.candidates.length > 0, "EMPTY_REALIZATION_OVERLAY", "Realization Overlay has no Candidates");

  const candidateIds = new Set(source.candidates.map((candidate) => candidate.id));
  for (const candidate of overlay.candidates) {
    resolveLogicalOutput(source, candidate.output);
    assert(!candidateIds.has(candidate.id), "OVERLAY_CANDIDATE_CONFLICT", `Candidate ${candidate.id} already exists`);
    assert(candidate.id.length > 0, "EMPTY_CANDIDATE_ID", "Overlay Candidate id is empty");
    candidateIds.add(candidate.id);
  }
}

function sealRealizationClosure(
  sourceGraph: Digest,
  overlays: readonly RealizationOverlay[],
): RealizationClosure {
  const content = {
    format: "svml.realization-closure@1" as const,
    sourceGraph,
    overlays: overlays.map((overlay) => overlay.id).sort(),
  };
  return { ...content, id: digestOf(content) };
}

export function resolveRealization(
  program: LinkedProgram,
  source: CompiledGraph,
  overlays: readonly RealizationOverlay[],
): ResolvedRealization {
  assert(overlays.length > 0, "EMPTY_REALIZATION_CLOSURE", "no Realization Overlay was supplied");
  for (const overlay of overlays) verifyRealizationOverlay(program, source, overlay);
  const closure = sealRealizationClosure(source.id, overlays);
  const candidates = overlays.flatMap((overlay) => overlay.candidates);
  const operations = overlays.flatMap((overlay) => overlay.operations);
  const attachments = new Map<string, string[]>();
  for (const candidate of candidates) {
    const attached = attachments.get(candidate.output) ?? [];
    attached.push(candidate.id);
    attachments.set(candidate.output, attached);
  }
  const graph = sealCompiledGraph({
    program: source.program,
    source: source.source,
    realization: closure.id,
    outputs: source.outputs.map((output) => ({
      ...output,
      candidates: [...output.candidates, ...(attachments.get(output.id) ?? [])],
    })),
    candidates: [...source.candidates, ...candidates],
    operations: [...source.operations, ...operations],
  });
  verifyCompiledGraph(program, graph);
  return { closure, graph };
}

export function verifyResolvedRealization(
  program: LinkedProgram,
  source: CompiledGraph,
  resolved: ResolvedRealization,
  overlays: readonly RealizationOverlay[],
): void {
  const expected = resolveRealization(program, source, overlays);
  assert(
    digestOf(resolved) === digestOf(expected),
    "REALIZATION_CLOSURE_MISMATCH",
    "resolved Realization differs from its source graph and Overlays",
  );
}
