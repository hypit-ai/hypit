import {
  assertTemporalControl,
  evaluateTemporalControl,
  pointwiseOperatorTemporalSupport,
  type AudioOperator,
  type TemporalControl,
} from "@hypit/audiovisual";
import { canonicalize } from "@hypit/hypit/protocol";
import type { ExactTemporalValue, Rational } from "@hypit/temporal/algebra";

/** Exact process format authored by Audio Mix gain branches. */
export const AUDIO_GAIN_PROCESS_FORMAT = "hypit.audio-gain@1" as const;

export type AudioGainInterpolation = { readonly kind: "linear" };
export type AudioGainControl = TemporalControl<number, AudioGainInterpolation>;
export type AudioGainProgram =
  | { readonly kind: "constant"; readonly gain: number }
  | { readonly kind: "control"; readonly control: AudioGainControl };

function assertGain(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} is invalid.`);
}

export function assertAudioGainControl(value: AudioGainControl): void {
  assertTemporalControl(value, assertGain, (interpolation, label) => {
    if (interpolation.kind !== "linear") throw new Error(`${label}.kind is invalid.`);
  });
}

export function sealAudioGainControl(value: AudioGainControl): AudioGainControl {
  assertAudioGainControl(value);
  return structuredClone(value);
}

function rationalNumber(value: Rational): number {
  const scale = 1_000_000_000_000_000n;
  return Number(value.numerator * scale / value.denominator) / Number(scale);
}

export function evaluateAudioGainControl(
  value: AudioGainControl,
  at: ExactTemporalValue,
): number {
  assertAudioGainControl(value);
  return evaluateTemporalControl(value, at, (from, to, progress) =>
    from + (to - from) * rationalNumber(progress));
}

export function audioGainProcess(gain: number): AudioOperator["program"] {
  assertGain(gain, "Audio Gain process");
  return {
    format: AUDIO_GAIN_PROCESS_FORMAT,
    payload: canonicalize({ gain }) as AudioOperator["program"]["payload"],
    artifacts: [],
  };
}

export function audioGainControlProcess(control: AudioGainControl): AudioOperator["program"] {
  const value = sealAudioGainControl(control);
  return {
    format: AUDIO_GAIN_PROCESS_FORMAT,
    payload: canonicalize({ control: value }) as AudioOperator["program"]["payload"],
    artifacts: [],
  };
}

export function readAudioGainProgram(program: AudioOperator["program"]): AudioGainProgram {
  if (program.format !== AUDIO_GAIN_PROCESS_FORMAT || program.artifacts.length !== 0) {
    throw new Error(`Audio Gain does not support Process format ${program.format}.`);
  }
  const payload = program.payload as { readonly gain?: unknown; readonly control?: unknown };
  const keys = Object.keys(payload).join("\u0000");
  if (keys === "gain" && typeof payload.gain === "number") {
    assertGain(payload.gain, "Audio Gain process payload");
    return { kind: "constant", gain: payload.gain };
  }
  if (keys === "control") {
    assertAudioGainControl(payload.control as AudioGainControl);
    return { kind: "control", control: structuredClone(payload.control as AudioGainControl) };
  }
  throw new Error("Audio Gain process payload is invalid.");
}

export function readAudioGainProcess(program: AudioOperator["program"]): number {
  const value = readAudioGainProgram(program);
  if (value.kind !== "constant") throw new Error("Audio Gain process is controlled, not constant.");
  return value.gain;
}

export function audioGainControlOperator(control: AudioGainControl): AudioOperator {
  const value = sealAudioGainControl(control);
  return {
    id: "hypit.audio-mix:gain-control",
    inputs: ["signal"],
    temporalControls: { gain: structuredClone(value.domain) },
    temporalSupport: pointwiseOperatorTemporalSupport(["signal"]),
    program: audioGainControlProcess(value),
  };
}

/** Package-owned AVIR contract; gain remains in the execution programme payload. */
export function audioGainOperator(gain: number): AudioOperator {
  return {
    id: "hypit.audio-mix:gain",
    inputs: ["signal"],
    temporalControls: {},
    temporalSupport: pointwiseOperatorTemporalSupport(["signal"]),
    program: audioGainProcess(gain),
  };
}
