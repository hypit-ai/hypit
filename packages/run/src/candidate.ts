import { normalizeValue } from "@hypit/protocol";
import type {
  Candidate,
  Value,
  TypeRef,
} from "@hypit/protocol";

export type ValueCandidateInput = {
  readonly id: string;
  readonly type: TypeRef;
  readonly value: Value;
  readonly record?: string;
};

export type SupplyCandidateInput = {
  readonly id: string;
  readonly type: TypeRef;
  readonly record?: string;
};

export function createValueCandidate(input: ValueCandidateInput): Candidate {
  if (input.id.trim().length === 0) throw new Error("Value Candidate id is empty");
  const value = normalizeValue(input.value);
  return {
    id: `candidate:run:${input.id}`,
    type: input.type,
    root: {
      kind: "value",
      record: input.record ?? `record:run:source:${input.id}`,
      value,
    },
  };
}

/** Declare a selectable zero-input supply without claiming that its value already exists. */
export function createSupplyCandidate(input: SupplyCandidateInput): Candidate {
  if (input.id.trim().length === 0) throw new Error("Supply Candidate id is empty");
  return {
    id: `candidate:run:${input.id}`,
    type: input.type,
    root: {
      kind: "supply",
      record: input.record ?? `record:run:source:${input.id}`,
    },
  };
}
