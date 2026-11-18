import { assertHtmlVisual } from "@hypit/html-program";
import { assertIdentity } from "@hypit/nle";
import { assertLocalTemporalDomain } from "@hypit/temporal/algebra";
import type { AudioOperator, PictureOperator } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertOperator(value: PictureOperator | AudioOperator, label: string): void {
  assertIdentity(value.id, `${label}.id`);
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
}

export function assertPictureOperator(value: PictureOperator, label = "PictureOperator"): void {
  assertOperator(value, label);
  assertHtmlVisual(value.visual);
}

export function assertAudioOperator(value: AudioOperator, label = "AudioOperator"): void {
  assertOperator(value, label);
}
