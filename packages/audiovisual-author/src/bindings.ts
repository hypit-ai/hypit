import {
  assertAudioOperator,
  assertPictureOperator,
  assertProgramSource,
  assertSignalReconstruction,
} from "@hypit/audiovisual";
import type { AudioOperator, PictureOperator, SignalReconstruction } from "@hypit/audiovisual";
import type { CanonicalValue } from "@hypit/protocol";

import type {
  AudiovisualAuthorBindingSet,
  AudiovisualAuthorOperatorBinding,
  AudiovisualAuthorReconstructionBinding,
  AudiovisualAuthorValue,
  AudiovisualAuthorValueBinding,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function assertOperators(value: AudiovisualAuthorBindingSet): void {
  for (const [name, operator] of Object.entries(value.pictureOperators ?? {})) {
    assertIdentity(name, "Author Picture Operator binding");
    assertPictureOperator(operator, `Author Picture Operator ${name}`);
  }
  for (const [name, operator] of Object.entries(value.audioOperators ?? {})) {
    assertIdentity(name, "Author Audio Operator binding");
    assertAudioOperator(operator, `Author Audio Operator ${name}`);
  }
  for (const [name, reconstruction] of Object.entries(value.reconstructions ?? {})) {
    assertIdentity(name, "Author Signal Reconstruction binding");
    assertSignalReconstruction(reconstruction, `Author Signal Reconstruction ${name}`);
  }
}

export function assertAudiovisualAuthorOperatorBinding(value: AudiovisualAuthorOperatorBinding): void {
  assertIdentity(value.name, "Author Operator binding name");
}

export function assertAudiovisualAuthorReconstructionBinding(
  value: AudiovisualAuthorReconstructionBinding,
): void {
  assertIdentity(value.name, "Author Signal Reconstruction binding name");
}

export function assertAudiovisualAuthorValueBinding(value: AudiovisualAuthorValueBinding): void {
  assertIdentity(value.name, "Author value binding name");
}

export function assertAudiovisualAuthorBindingSet(value: AudiovisualAuthorBindingSet): void {
  assertOperators(value);
  for (const [name, source] of Object.entries(value.sources)) {
    assertIdentity(name, "Author resolved Source binding");
    assertProgramSource(source);
  }
}

export function createAudiovisualAuthorBindingSet(): AudiovisualAuthorBindingSet {
  return { values: {}, sources: {} };
}

export function appendAudiovisualAuthorValue(
  set: AudiovisualAuthorBindingSet,
  binding: AudiovisualAuthorValueBinding,
  value: CanonicalValue,
): AudiovisualAuthorBindingSet {
  assertAudiovisualAuthorBindingSet(set);
  assertAudiovisualAuthorValueBinding(binding);
  assert(!Object.hasOwn(set.values ?? {}, binding.name),
    `Author value binding ${binding.name} is already resolved.`);
  return { ...structuredClone(set), values: {
    ...structuredClone(set.values ?? {}), [binding.name]: structuredClone(value),
  } };
}

export function resolveAudiovisualAuthorValue<Value>(
  authored: AudiovisualAuthorValue<Value>,
  bindings: AudiovisualAuthorBindingSet,
  validate: (value: Value, label: string) => void,
  label: string,
): Value {
  const value = typeof authored === "object" && authored !== null
    && "kind" in authored && authored.kind === "binding"
    ? bindings.values?.[authored.name]
    : authored;
  assert(value !== undefined, `${label} has no resolved value binding ${
    typeof authored === "object" && authored !== null && "name" in authored ? authored.name : ""}.`);
  validate(value as Value, label);
  return structuredClone(value as Value);
}

export function appendAudiovisualAuthorPictureOperator(
  set: AudiovisualAuthorBindingSet,
  binding: AudiovisualAuthorOperatorBinding,
  operator: PictureOperator,
): AudiovisualAuthorBindingSet {
  assertAudiovisualAuthorBindingSet(set);
  assertAudiovisualAuthorOperatorBinding(binding);
  assertPictureOperator(operator);
  assert(!Object.hasOwn(set.pictureOperators ?? {}, binding.name),
    `Author Picture Operator binding ${binding.name} is already resolved.`);
  return {
    ...structuredClone(set),
    pictureOperators: {
      ...structuredClone(set.pictureOperators ?? {}),
      [binding.name]: structuredClone(operator),
    },
  };
}

export function appendAudiovisualAuthorAudioOperator(
  set: AudiovisualAuthorBindingSet,
  binding: AudiovisualAuthorOperatorBinding,
  operator: AudioOperator,
): AudiovisualAuthorBindingSet {
  assertAudiovisualAuthorBindingSet(set);
  assertAudiovisualAuthorOperatorBinding(binding);
  assertAudioOperator(operator);
  assert(!Object.hasOwn(set.audioOperators ?? {}, binding.name),
    `Author Audio Operator binding ${binding.name} is already resolved.`);
  return {
    ...structuredClone(set),
    audioOperators: {
      ...structuredClone(set.audioOperators ?? {}),
      [binding.name]: structuredClone(operator),
    },
  };
}

export function appendAudiovisualAuthorReconstruction(
  set: AudiovisualAuthorBindingSet,
  binding: AudiovisualAuthorReconstructionBinding,
  reconstruction: SignalReconstruction,
): AudiovisualAuthorBindingSet {
  assertAudiovisualAuthorBindingSet(set);
  assertAudiovisualAuthorReconstructionBinding(binding);
  assertSignalReconstruction(reconstruction);
  assert(!Object.hasOwn(set.reconstructions ?? {}, binding.name),
    `Author Signal Reconstruction binding ${binding.name} is already resolved.`);
  return {
    ...structuredClone(set),
    reconstructions: {
      ...structuredClone(set.reconstructions ?? {}),
      [binding.name]: structuredClone(reconstruction),
    },
  };
}
