import { verifyAudioProgram } from "@hypit/audio-program";
import type { AudioOutputSampling, AudioProgram } from "@hypit/audio-program";

export type AudiovisualAudioSource = {
  /** Nominal ProgramSource identity implemented by this terminal value. */
  readonly source: string;
  readonly output: string;
  /** Closed signal in the Source output's own local Domain. */
  readonly program: AudioProgram;
};

export type AudiovisualAudioSourceSet = {
  readonly sources: readonly AudiovisualAudioSource[];
};

export type AudiovisualAudioOutput = AudioOutputSampling;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

export function assertAudiovisualAudioOutput(value: AudiovisualAudioOutput): void {
  assert(Number.isSafeInteger(value.sampleRate) && value.sampleRate > 0,
    "Audiovisual Audio output sample rate must be a positive safe integer.");
}

export function sealAudiovisualAudioSource(value: AudiovisualAudioSource): AudiovisualAudioSource {
  identity(value.source, "Audiovisual Audio Source identity");
  identity(value.output, "Audiovisual Audio Source output");
  verifyAudioProgram(value.program);
  return structuredClone(value);
}

export function createAudiovisualAudioSourceSet(): AudiovisualAudioSourceSet {
  return { sources: [] };
}

export function assertAudiovisualAudioSourceSet(value: AudiovisualAudioSourceSet): void {
  assert(Array.isArray(value.sources), "Audiovisual Audio Source set is invalid.");
  const keys = new Set<string>();
  for (const source of value.sources) {
    sealAudiovisualAudioSource(source);
    const key = `${source.source}\u0000${source.output}`;
    assert(!keys.has(key),
      `Audiovisual Audio Source ${source.source}.${source.output} is implemented more than once.`);
    keys.add(key);
  }
}

export function appendAudiovisualAudioSource(
  set: AudiovisualAudioSourceSet,
  source: AudiovisualAudioSource,
): AudiovisualAudioSourceSet {
  assertAudiovisualAudioSourceSet(set);
  const next = { sources: [...set.sources, sealAudiovisualAudioSource(source)] };
  assertAudiovisualAudioSourceSet(next);
  return structuredClone(next);
}

export function resolveAudiovisualAudioSource(
  set: AudiovisualAudioSourceSet,
  source: string,
  output: string,
): AudiovisualAudioSource {
  assertAudiovisualAudioSourceSet(set);
  const matches = set.sources.filter((value) => value.source === source && value.output === output);
  assert(matches.length === 1,
    `Audiovisual Audio Source ${source}.${output} has ${matches.length} terminal implementations.`);
  return structuredClone(matches[0]!);
}
