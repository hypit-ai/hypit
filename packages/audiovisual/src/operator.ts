import { assertBlobRef, canonicalStringify, isTypeRef } from "@hypit/protocol";
import {
  assertExactTemporalValue,
  assertLocalTemporalDomain,
  compareExactTemporalValues,
  exactTemporalZero,
} from "@hypit/temporal/algebra";

import type {
  AudioOperator,
  PictureOperator,
  OperatorTemporalSupport,
  SignalOperatorProgram,
  SignalReconstruction,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

export function assertSignalOperatorProgram(value: SignalOperatorProgram, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is invalid.`);
  assert(typeof value.format === "string" && value.format.length > 0, `${label}.format is empty.`);
  assert(value.payload !== null && typeof value.payload === "object" && !Array.isArray(value.payload),
    `${label}.payload must be an object.`);
  canonicalStringify(value.payload);
  assert(Array.isArray(value.artifacts), `${label}.artifacts must be an array.`);
  for (const [index, artifact] of value.artifacts.entries()) {
    assertBlobRef(artifact, `${label}.artifacts.${index}`);
  }
}

export function assertSignalReconstruction(
  value: SignalReconstruction,
  label = "SignalReconstruction",
): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is invalid.`);
  assert(isTypeRef(value.signal), `${label}.signal Type is invalid.`);
  assertSignalOperatorProgram(value.program, `${label}.program`);
}

function assertDuration(value: import("@hypit/temporal/algebra").ExactTemporalValue, label: string): void {
  assertExactTemporalValue(value, label);
  assert(compareExactTemporalValues(value, exactTemporalZero()) >= 0, `${label} must not be negative.`);
}

export function pointwiseOperatorTemporalSupport(inputs: readonly string[]): OperatorTemporalSupport {
  const zero = exactTemporalZero();
  return {
    inputs: Object.fromEntries(inputs.map((name) => [name, {
      before: structuredClone(zero),
      after: structuredClone(zero),
    }])),
    state: { kind: "independent" },
    latency: structuredClone(zero),
    tail: structuredClone(zero),
  };
}

export function assertOperatorTemporalSupport(
  value: OperatorTemporalSupport,
  inputs: readonly string[],
  label = "Operator temporal support",
): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is invalid.`);
  assert(value.inputs !== null && typeof value.inputs === "object" && !Array.isArray(value.inputs),
    `${label}.inputs is invalid.`);
  const expected = new Set(inputs);
  for (const name of Object.keys(value.inputs)) assert(expected.has(name), `${label} has unknown input ${name}.`);
  for (const name of inputs) {
    const support = value.inputs[name];
    assert(support !== undefined, `${label} is missing input ${name}.`);
    assertDuration(support.before, `${label}.${name}.before`);
    assertDuration(support.after, `${label}.${name}.after`);
  }
  assertDuration(value.latency, `${label}.latency`);
  assertDuration(value.tail, `${label}.tail`);
  assert(value.state?.kind === "independent" || value.state?.kind === "sequential",
    `${label}.state is invalid.`);
  if (value.state.kind === "sequential") assertDuration(value.state.preRoll, `${label}.state.preRoll`);
}

export function isPointwiseOperatorTemporalSupport(value: OperatorTemporalSupport): boolean {
  assertOperatorTemporalSupport(value, Object.keys(value.inputs));
  const zero = exactTemporalZero();
  return value.state.kind === "independent"
    && compareExactTemporalValues(value.latency, zero) === 0
    && compareExactTemporalValues(value.tail, zero) === 0
    && Object.values(value.inputs).every((support) =>
      compareExactTemporalValues(support.before, zero) === 0
      && compareExactTemporalValues(support.after, zero) === 0);
}

function assertOperator(
  value: PictureOperator | AudioOperator,
  kind: "Picture" | "Audio",
  label: string,
): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is invalid.`);
  assertIdentity(value.id, `${label}.id`);
  assert(Array.isArray(value.inputs) && value.inputs.length > 0,
    `${label} must declare at least one named ${kind} input.`);
  const names = new Set<string>();
  for (const name of value.inputs) {
    assertIdentity(name, `${label} input`);
    assert(!names.has(name), `${label} repeats input ${name}.`);
    names.add(name);
  }
  assert(value.temporalControls !== null && typeof value.temporalControls === "object"
    && !Array.isArray(value.temporalControls), `${label}.temporalControls is invalid.`);
  for (const [name, domain] of Object.entries(value.temporalControls)) {
    assertIdentity(name, `${label} temporal Control`);
    assertLocalTemporalDomain(domain);
  }
  assertOperatorTemporalSupport(value.temporalSupport, value.inputs, `${label}.temporalSupport`);
  assertSignalOperatorProgram(value.program, `${label}.program`);
}

export function assertPictureOperator(value: PictureOperator, label = "PictureOperator"): void {
  assertOperator(value, "Picture", label);
}

export function assertAudioOperator(value: AudioOperator, label = "AudioOperator"): void {
  assertOperator(value, "Audio", label);
}
