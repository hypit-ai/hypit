import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
} from "./exact.js";
import type {
  LocalTemporalDomain,
} from "./algebra-types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

export function sealLocalTemporalDomain(value: LocalTemporalDomain): LocalTemporalDomain {
  assertLocalTemporalDomain(value);
  return structuredClone(value);
}

export function assertLocalTemporalDomain(value: LocalTemporalDomain): void {
  assertIdentity(value.id, "LocalTemporalDomain.id");
  assertExactTemporalValue(value.duration, "LocalTemporalDomain.duration");
  assert(compareExactTemporalValues(value.duration, exactTemporalZero()) > 0,
    "LocalTemporalDomain.duration must be positive.");
}
