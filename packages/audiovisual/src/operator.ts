import {
  assertExactTemporalValue,
  assertLocalTemporalDomain,
  compareExactTemporalValues,
  exactTemporalZero,
} from "@hypit/temporal/algebra";
import { assertIdentity, assertImplementationBinding } from "./implementation.js";
import type {
  AudioOperator,
  OperatorTemporalSupport,
  PictureOperator,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertDuration(value: import("@hypit/temporal/algebra").ExactTemporalValue, label: string): void {
  assertExactTemporalValue(value, label);
  assert(compareExactTemporalValues(value, exactTemporalZero()) >= 0, `${label} must not be negative.`);
}

export function pointwiseOperatorTemporalSupport(inputs: readonly string[]): OperatorTemporalSupport {
  const zero = exactTemporalZero();
  return {
    inputs: Object.fromEntries(inputs.map((name) => [name, {
      before: structuredClone(zero), after: structuredClone(zero),
    }])),
    tail: structuredClone(zero),
  };
}

export function assertOperatorTemporalSupport(
  value: OperatorTemporalSupport,
  inputs: readonly string[],
  label = "Operator temporal support",
): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is invalid.`);
  const expected = new Set(inputs);
  for (const name of Object.keys(value.inputs)) assert(expected.has(name), `${label} has unknown input ${name}.`);
  for (const name of inputs) {
    const support = value.inputs[name];
    assert(support !== undefined, `${label} is missing input ${name}.`);
    assertDuration(support.before, `${label}.${name}.before`);
    assertDuration(support.after, `${label}.${name}.after`);
  }
  assertDuration(value.tail, `${label}.tail`);
}

export function isPointwiseOperatorTemporalSupport(value: OperatorTemporalSupport): boolean {
  assertOperatorTemporalSupport(value, Object.keys(value.inputs));
  const zero = exactTemporalZero();
  return compareExactTemporalValues(value.tail, zero) === 0
    && Object.values(value.inputs).every((support) =>
      compareExactTemporalValues(support.before, zero) === 0
      && compareExactTemporalValues(support.after, zero) === 0);
}

function assertOperator(value: PictureOperator | AudioOperator, label: string): void {
  assertIdentity(value.id, `${label}.id`);
  assertImplementationBinding(value, label);
  assert(Array.isArray(value.inputs) && value.inputs.length > 0, `${label} must declare at least one input.`);
  const names = new Set<string>();
  for (const name of value.inputs) {
    assertIdentity(name, `${label} input`);
    assert(!names.has(name), `${label} repeats input ${name}.`);
    names.add(name);
  }
  for (const [name, domain] of Object.entries(value.temporalControls)) {
    assertIdentity(name, `${label} temporal Control`);
    assertLocalTemporalDomain(domain);
  }
  assertOperatorTemporalSupport(value.temporalSupport, value.inputs, `${label}.temporalSupport`);
}

export function assertPictureOperator(value: PictureOperator, label = "PictureOperator"): void {
  assertOperator(value, label);
}

export function assertAudioOperator(value: AudioOperator, label = "AudioOperator"): void {
  assertOperator(value, label);
}
