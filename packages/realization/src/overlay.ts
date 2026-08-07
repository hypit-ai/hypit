import {
  canonicalize,
  digestOf,
  EMPTY_REALIZATION_DIGEST,
  isDigest,
  sealCompiledGraph,
  verifyBuildState,
  verifyCompiledGraph,
} from "@svml/core";
import type {
  BuildState,
  Candidate,
  CanonicalValue,
  CompiledGraph,
  Digest,
  LinkedProgram,
  OperationNode,
  StoredValue,
  TypeValidationReceipt,
  TypeRef,
} from "@svml/protocol";

export type RealizationOverlay = {
  readonly format: "svml.realization-overlay@2";
  readonly id: Digest;
  /** Exact Author Graph whose Logical Outputs may be referenced by this Run Graph. */
  readonly sourceGraph: Digest;
  readonly candidates: readonly Candidate[];
  readonly operations: readonly OperationNode[];
};

export type RealizationClosure = {
  readonly format: "svml.realization-closure@2";
  readonly id: Digest;
  readonly sourceGraph: Digest;
  readonly overlays: readonly Digest[];
};

export type ResolvedRealization = {
  readonly closure: RealizationClosure;
  readonly graph: CompiledGraph;
};

export type ProvidedCandidateInput = {
  readonly type: TypeRef;
  readonly value: StoredValue;
  readonly record?: string;
  readonly provenance?: CanonicalValue;
  readonly validation?: TypeValidationReceipt;
};

export type BuildRecordCandidateInput = {
  /** A previously verified BuildState used only as a source of one typed value. */
  readonly build: BuildState;
  /** Historical Logical Output whose selected Record becomes an independent Candidate. */
  readonly sourceOutput: string;
};

/** @deprecated Use BuildRecordCandidateInput. */
export type HistoricalCandidateInput = BuildRecordCandidateInput;

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
    format: "svml.realization-overlay@2",
    sourceGraph: overlay.sourceGraph,
    candidates: [...overlay.candidates].sort((left, right) => left.id.localeCompare(right.id)),
    operations: [...overlay.operations].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function sealRealizationOverlay(
  overlay: Omit<RealizationOverlay, "format" | "id">,
): RealizationOverlay {
  const draft = {
    format: "svml.realization-overlay@2" as const,
    id: digestOf("unsealed-realization-overlay"),
    ...overlay,
  };
  const content = overlayContent(draft);
  assert(content.candidates.length > 0, "EMPTY_REALIZATION_OVERLAY", "Realization Overlay has no Candidates");
  return { ...content, id: digestOf(content) };
}

/** Canonical Run-Graph name; retained alongside the Overlay API name. */

export function createProvidedCandidate(input: ProvidedCandidateInput): Candidate {
  const value = input.value.kind === "inline"
    ? { kind: "inline" as const, value: canonicalize(input.value.value) }
    : { ...input.value };
  const identity = {
    kind: "provided-candidate@1",
    type: input.type,
    value,
    ...(input.provenance === undefined ? {} : { provenance: canonicalize(input.provenance) }),
    ...(input.validation === undefined ? {} : { validation: input.validation }),
  };
  const suffix = digestOf(identity).slice("sha256:".length);
  return {
    id: `candidate:${suffix}`,
    type: input.type,
    root: {
      kind: "value",
      value: {
        id: input.record ?? `provided:${suffix}`,
        value,
        ...(input.provenance === undefined ? {} : { provenance: canonicalize(input.provenance) }),
        ...(input.validation === undefined ? {} : { validation: input.validation }),
      },
    },
  };
}

/**
 * Reattach one typed historical Record as an ordinary inert substitute Candidate.
 * The prior Build is verified only so the Host can safely extract the value, Type receipt and
 * provenance. History makes no claim that the value satisfies the current author's meaning.
 * No prior Operation, Command or outstanding execution state crosses the boundary.
 */
export function createBuildRecordCandidate(input: BuildRecordCandidateInput): Candidate {
  verifyBuildState(input.build);
  const sourceOutput = input.sourceOutput;
  const selection = input.build.plan.selections.find((item) => item.output === sourceOutput);
  assert(selection !== undefined, "HISTORICAL_OUTPUT_UNSELECTED", "historical Build did not select this Logical Output", sourceOutput);
  const record = input.build.records.find((item) => item.id === selection.record);
  assert(record !== undefined, "HISTORICAL_RECORD_MISSING", "historical Output Record is absent", selection.record);
  return createProvidedCandidate({
    type: record.type,
    value: record.value,
    provenance: {
      format: "svml.historical-output@1",
      sourceBuild: input.build.id,
      sourceRequest: input.build.request.digest,
      sourceOutput,
      sourceCandidate: selection.candidate,
      sourceRecord: record.id,
      sourceRecordDigest: record.digest,
    },
    ...(record.validation === undefined ? {} : { validation: record.validation }),
  });
}

/** @deprecated Use createBuildRecordCandidate. */
export const createHistoricalCandidate = createBuildRecordCandidate;

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
  assert(overlay.format === "svml.realization-overlay@2", "UNSUPPORTED_REALIZATION_OVERLAY", "unsupported Overlay format");
  assert(isDigest(overlay.id), "INVALID_OVERLAY_DIGEST", "Realization Overlay id is not a digest");
  assert(overlay.id === digestOf(overlayContent(overlay)), "OVERLAY_DIGEST_MISMATCH", "Realization Overlay digest differs");
  assert(overlay.sourceGraph === source.id, "OVERLAY_SOURCE_MISMATCH", "Realization Overlay targets another author graph");
  assert(overlay.candidates.length > 0, "EMPTY_REALIZATION_OVERLAY", "Realization Overlay has no Candidates");

  const candidateIds = new Set(source.candidates.map((candidate) => candidate.id));
  for (const candidate of overlay.candidates) {
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
    format: "svml.realization-closure@2" as const,
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
  const graph = sealCompiledGraph({
    program: source.program,
    source: source.source,
    realization: closure.id,
    outputs: source.outputs,
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
