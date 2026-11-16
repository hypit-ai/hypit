import { assertImplementationBinding } from "./implementation.js";
import type { SignalReconstruction } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertSignalReconstruction(
  value: SignalReconstruction,
  label = "Signal reconstruction",
): void {
  assertImplementationBinding(value, label);
  assert(value.signal === "picture" || value.signal === "audio", `${label}.signal is invalid.`);
}

export function sealSignalReconstruction(value: SignalReconstruction): SignalReconstruction {
  assertSignalReconstruction(value);
  return structuredClone(value);
}
