import type { AudioReconstruction } from "@hypit/audio-track";

export const PITCH_PRESERVING_RECONSTRUCTION_FORMAT = "hypit.audio-preserve-pitch@1" as const;

/** Preserve pitch while following the exact source positions supplied by the occurrence Map. */
export function preservePitch(): AudioReconstruction {
  return {
    format: PITCH_PRESERVING_RECONSTRUCTION_FORMAT,
    payload: {},
    artifacts: [],
  };
}

export function readPreservePitch(program: AudioReconstruction): void {
  if (program.format !== PITCH_PRESERVING_RECONSTRUCTION_FORMAT) {
    throw new Error(`Audio Stretch does not support reconstruction format ${program.format}.`);
  }
  if (Object.keys(program.payload).length !== 0 || program.artifacts.length !== 0) {
    throw new Error("Preserve Pitch reconstruction must not contain parameters or artifacts.");
  }
}
