import { audioType } from "@hypit/audiovisual";
import type { SignalOperatorProgram, SignalReconstruction } from "@hypit/audiovisual";

export const PITCH_PRESERVING_RECONSTRUCTION_FORMAT = "hypit.audio-preserve-pitch@1" as const;

/** Preserve pitch while following the exact source positions supplied by the occurrence Map. */
export function preservePitch(): SignalReconstruction {
  return { signal: audioType, program: {
    format: PITCH_PRESERVING_RECONSTRUCTION_FORMAT,
    payload: {},
    artifacts: [],
  } };
}

export function readPreservePitch(program: SignalOperatorProgram): void {
  if (program.format !== PITCH_PRESERVING_RECONSTRUCTION_FORMAT) {
    throw new Error(`Audio Preserve Pitch does not support reconstruction format ${program.format}.`);
  }
  if (Object.keys(program.payload).length !== 0 || program.artifacts.length !== 0) {
    throw new Error("Preserve Pitch reconstruction must not contain parameters or artifacts.");
  }
}
