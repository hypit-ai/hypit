import {
  assertAudioOperator,
  assertPictureOperator,
  assertProgramSource,
  assertSignalReconstruction,
} from "@hypit/audiovisual";
import type { AudioOperator, PictureOperator, SignalReconstruction } from "@hypit/audiovisual";

import type {
  AudiovisualAuthorBindingSet,
  AudiovisualAuthorOperatorBinding,
  AudiovisualAuthorReconstructionBinding,
  AudiovisualAuthorSourceBinding,
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

export function assertAudiovisualAuthorSourceBinding(value: AudiovisualAuthorSourceBinding): void {
  assertIdentity(value.name, "Author Source binding name");
}

export function assertAudiovisualAuthorOperatorBinding(value: AudiovisualAuthorOperatorBinding): void {
  assertIdentity(value.name, "Author Operator binding name");
}

export function assertAudiovisualAuthorReconstructionBinding(
  value: AudiovisualAuthorReconstructionBinding,
): void {
  assertIdentity(value.name, "Author Signal Reconstruction binding name");
}

export function assertAudiovisualAuthorBindingSet(value: AudiovisualAuthorBindingSet): void {
  assertOperators(value);
  for (const [name, source] of Object.entries(value.sources)) {
    assertIdentity(name, "Author resolved Source binding");
    assertProgramSource(source);
  }
}

export function createAudiovisualAuthorBindingSet(): AudiovisualAuthorBindingSet {
  return { sources: {} };
}

export function appendAudiovisualAuthorSource(
  set: AudiovisualAuthorBindingSet,
  binding: AudiovisualAuthorSourceBinding,
  source: import("@hypit/audiovisual").ProgramSource,
): AudiovisualAuthorBindingSet {
  assertAudiovisualAuthorBindingSet(set);
  assertAudiovisualAuthorSourceBinding(binding);
  assertProgramSource(source);
  assert(!Object.hasOwn(set.sources, binding.name),
    `Author Source binding ${binding.name} is already resolved.`);
  return {
    ...structuredClone(set),
    sources: { ...structuredClone(set.sources), [binding.name]: structuredClone(source) },
  };
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
