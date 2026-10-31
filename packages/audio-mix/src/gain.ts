import type { AudioProcessProgram } from "@hypit/composition";
import { canonicalize } from "@hypit/hypit/protocol";

/** Exact process format authored by Audio Mix gain branches. */
export const AUDIO_GAIN_PROCESS_FORMAT = "hypit.audio-gain@1" as const;

export function audioGainProcess(gain: number): AudioProcessProgram {
  if (!Number.isFinite(gain) || gain < 0) throw new Error("Audio Gain process is invalid.");
  return {
    format: AUDIO_GAIN_PROCESS_FORMAT,
    payload: canonicalize({ gain }) as AudioProcessProgram["payload"],
    artifacts: [],
  };
}

export function readAudioGainProcess(program: AudioProcessProgram): number {
  if (program.format !== AUDIO_GAIN_PROCESS_FORMAT || program.artifacts.length !== 0) {
    throw new Error(`Audio Gain does not support Process format ${program.format}.`);
  }
  const payload = program.payload as { readonly gain?: unknown };
  if (Object.keys(payload).join("\u0000") !== "gain" || typeof payload.gain !== "number"
    || !Number.isFinite(payload.gain) || payload.gain < 0) {
    throw new Error("Audio Gain process payload is invalid.");
  }
  return payload.gain;
}
