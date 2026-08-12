import {
  canonicalize,
  digestOf,
  verifyBuildState,
} from "@narratage/core";
import type {
  BuildState,
  Candidate,
  StoredValue,
  TypeRef,
  TypeValidationReceipt,
} from "@narratage/protocol";

export type ProvidedCandidateInput = {
  readonly type: TypeRef;
  readonly value: StoredValue;
  readonly record?: string;
  readonly validation?: TypeValidationReceipt;
};

export type BuildRecordCandidateInput = {
  readonly build: BuildState;
  readonly sourceOutput: string;
};

export class CandidateError extends Error {
  readonly code: string;
  readonly subject: string | undefined;

  constructor(code: string, message: string, subject?: string) {
    super(message);
    this.name = "CandidateError";
    this.code = code;
    this.subject = subject;
  }
}

function assert(condition: unknown, code: string, message: string, subject?: string): asserts condition {
  if (!condition) throw new CandidateError(code, message, subject);
}

export function createProvidedCandidate(input: ProvidedCandidateInput): Candidate {
  const value = input.value.kind === "inline"
    ? { kind: "inline" as const, value: canonicalize(input.value.value) }
    : { ...input.value };
  const identity = {
    kind: "provided-candidate@1",
    type: input.type,
    value,
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
        ...(input.validation === undefined ? {} : { validation: input.validation }),
      },
    },
  };
}

/**
 * Extract one verified historical output as an ordinary zero-input Candidate.
 * No historical execution state crosses this boundary.
 */
export function createBuildRecordCandidate(input: BuildRecordCandidateInput): Candidate {
  verifyBuildState(input.build);
  const selection = input.build.plan.selections.find((item) => item.output === input.sourceOutput);
  assert(
    selection !== undefined,
    "HISTORICAL_OUTPUT_UNSELECTED",
    "historical Build did not select this Logical Output",
    input.sourceOutput,
  );
  const record = input.build.records.find((item) => item.id === selection.record);
  assert(record !== undefined, "HISTORICAL_RECORD_MISSING", "historical Output Record is absent", selection.record);
  return createProvidedCandidate({
    type: record.type,
    value: record.value,
    ...(record.validation === undefined ? {} : { validation: record.validation }),
  });
}
