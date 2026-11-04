import type {
  TemporalDuration,
} from "./types.js";

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function safeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`);
}

export function assertTemporalDuration(value: unknown, label = "TemporalDuration"): asserts value is TemporalDuration {
  const duration = record(value, label);
  if (duration.unit === "frames" || duration.unit === "milliseconds") {
    safeInteger(duration.value, `${label}.value`);
    return;
  }
  if (duration.unit === "seconds") {
    safeInteger(duration.numerator, `${label}.numerator`);
    safeInteger(duration.denominator, `${label}.denominator`);
    if (duration.denominator <= 0) throw new Error(`${label}.denominator must be positive.`);
    return;
  }
  throw new Error(`${label}.unit is invalid.`);
}
