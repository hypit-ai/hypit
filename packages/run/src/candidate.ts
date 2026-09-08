import {
  canonicalize,
} from "@hypit/protocol";
import type {
  Candidate,
  StoredValue,
  TypeRef,
} from "@hypit/protocol";

export type ProvidedCandidateInput = {
  readonly id: string;
  readonly type: TypeRef;
  readonly value: StoredValue;
  readonly record?: string;
};

export function createProvidedCandidate(input: ProvidedCandidateInput): Candidate {
  if (input.id.trim().length === 0) throw new Error("Provided Candidate id is empty");
  const value = input.value.kind === "inline"
    ? { kind: "inline" as const, value: canonicalize(input.value.value) }
    : { ...input.value };
  return {
    id: `candidate:run:${input.id}`,
    type: input.type,
    root: {
      kind: "value",
      value: {
        id: input.record ?? `provided:run:${input.id}`,
        value,
      },
    },
  };
}
