import type { AudioProgram } from "./types.js";

export function assertAudioProgram(value: AudioProgram): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Audio Program must be an object.");
  if (!Number.isSafeInteger(value.sampleRate) || value.sampleRate <= 0 || ![1, 2].includes(value.channels)) {
    throw new Error("Audio Program output sampling is invalid.");
  }
  if (value.nodes[value.root] === undefined) throw new Error(`Audio Program has no root ${value.root}.`);
}

export function sealAudioProgram(value: AudioProgram): AudioProgram {
  assertAudioProgram(value);
  return structuredClone(value);
}
