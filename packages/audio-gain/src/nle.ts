import type {
  NleAudioEffectResolver,
  NleEffectParameterAuthoring,
  NlePackageSymbol,
} from "@hypit/nle";
import { canonicalize } from "@hypit/protocol";
import { sealLocalTemporalDomain } from "@hypit/temporal/algebra";
import { exactTemporalValueFromFrames } from "@hypit/temporal/sampling";

import {
  audioGainControlOperator,
  audioGainOperator,
  sealAudioGainControl,
  type AudioGainControl,
} from "./gain.js";
import { audioGainModuleRef } from "./manifest.js";

export type AudioGainNleFrame = {
  readonly atFrame: number;
  readonly gain: number;
};

/** Item-local NLE spelling owned by Audio Gain, not by NLE Core. */
export type AudioGainNleParameters =
  | { readonly kind: "constant"; readonly gain: number }
  | {
      readonly kind: "frames";
      readonly frames: readonly AudioGainNleFrame[];
      readonly interpolation: { readonly kind: "linear" };
    };

export type AudioGainNleEdit =
  | { readonly kind: "set-constant-gain"; readonly gain: number }
  | { readonly kind: "set-frame-gain"; readonly atFrame: number; readonly gain: number };

export const audioGainNleSymbol: NlePackageSymbol = {
  module: audioGainModuleRef,
  name: "gain",
};

function record(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a record.`);
  }
}

function exactFields(value: Readonly<Record<string, unknown>>, fields: readonly string[], label: string): void {
  if (Object.keys(value).sort().join("\u0000") !== [...fields].sort().join("\u0000")) {
    throw new Error(`${label} has invalid fields.`);
  }
}

function assertGain(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} is invalid.`);
  }
}

export function assertAudioGainNleParameters(
  value: unknown,
  durationFrames?: number,
): asserts value is AudioGainNleParameters {
  const label = "NLE Audio Gain parameters";
  record(value, label);
  if (value.kind === "constant") {
    exactFields(value, ["gain", "kind"], label);
    assertGain(value.gain, `${label}.gain`);
    return;
  }
  if (value.kind !== "frames") throw new Error(`${label}.kind is invalid.`);
  exactFields(value, ["frames", "interpolation", "kind"], label);
  record(value.interpolation, `${label}.interpolation`);
  exactFields(value.interpolation, ["kind"], `${label}.interpolation`);
  if (value.interpolation.kind !== "linear") throw new Error(`${label}.interpolation.kind is invalid.`);
  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    throw new Error(`${label}.frames must contain at least one frame.`);
  }
  let previous = -1;
  for (const [index, candidate] of value.frames.entries()) {
    const frameLabel = `${label}.frames[${index}]`;
    record(candidate, frameLabel);
    exactFields(candidate, ["atFrame", "gain"], frameLabel);
    if (!Number.isSafeInteger(candidate.atFrame) || (candidate.atFrame as number) < 0
      || (candidate.atFrame as number) <= previous) {
      throw new Error(`${frameLabel}.atFrame must be a strictly increasing non-negative safe integer.`);
    }
    if (index === 0 && candidate.atFrame !== 0) {
      throw new Error(`${label}.frames must begin at Item-local frame 0.`);
    }
    if (durationFrames !== undefined && (candidate.atFrame as number) >= durationFrames) {
      throw new Error(`${frameLabel}.atFrame must lie inside the Item duration.`);
    }
    assertGain(candidate.gain, `${frameLabel}.gain`);
    previous = candidate.atFrame as number;
  }
}

export function audioGainControlFromNleParameters(
  parameters: Extract<AudioGainNleParameters, { readonly kind: "frames" }>,
  input: {
    readonly itemId: string;
    readonly durationFrames: number;
    readonly frameRate: { readonly numerator: number; readonly denominator: number };
  },
): AudioGainControl {
  assertAudioGainNleParameters(parameters, input.durationFrames);
  const domain = sealLocalTemporalDomain({
    id: `${input.itemId}:time`,
    duration: exactTemporalValueFromFrames(input.durationFrames, { frameRate: input.frameRate }),
  });
  return sealAudioGainControl({
    domain,
    segments: parameters.frames.map((frame, index) => {
      const next = parameters.frames[index + 1];
      return {
        range: {
          start: exactTemporalValueFromFrames(frame.atFrame, { frameRate: input.frameRate }),
          end: exactTemporalValueFromFrames(next?.atFrame ?? input.durationFrames, {
            frameRate: input.frameRate,
          }),
        },
        from: frame.gain,
        to: next?.gain ?? frame.gain,
        interpolation: { kind: "linear" as const },
      };
    }),
  });
}

export function editAudioGainNleParameters(
  parameters: AudioGainNleParameters,
  operation: AudioGainNleEdit,
  durationFrames: number,
): AudioGainNleParameters {
  assertAudioGainNleParameters(parameters, durationFrames);
  record(operation, "NLE Audio Gain edit");
  if (operation.kind === "set-constant-gain") {
    exactFields(operation, ["gain", "kind"], "NLE Audio Gain edit");
    assertGain(operation.gain, "NLE Audio Gain edit.gain");
    return { kind: "constant", gain: operation.gain };
  }
  if (operation.kind !== "set-frame-gain") throw new Error("NLE Audio Gain edit.kind is invalid.");
  exactFields(operation, ["atFrame", "gain", "kind"], "NLE Audio Gain edit");
  if (parameters.kind !== "frames") throw new Error("NLE Audio Gain frame edit requires frame parameters.");
  if (!Number.isSafeInteger(operation.atFrame) || operation.atFrame < 0
    || operation.atFrame >= durationFrames) {
    throw new Error("NLE Audio Gain edit.atFrame must lie inside the Item duration.");
  }
  assertGain(operation.gain, "NLE Audio Gain edit.gain");
  const frames = parameters.frames.filter((frame) => frame.atFrame !== operation.atFrame);
  frames.push({ atFrame: operation.atFrame, gain: operation.gain });
  frames.sort((left, right) => left.atFrame - right.atFrame);
  const next: AudioGainNleParameters = {
    kind: "frames",
    frames,
    interpolation: { kind: "linear" },
  };
  assertAudioGainNleParameters(next, durationFrames);
  return next;
}

export const audioGainNleResolver: NleAudioEffectResolver = {
  effect: audioGainNleSymbol,
  resolve: (effect, item, { project }) => {
    const parameters = effect.parameters as unknown;
    assertAudioGainNleParameters(parameters, item.durationFrames);
    if (parameters.kind === "constant") return { operator: audioGainOperator(parameters.gain) };
    return { operator: audioGainControlOperator(audioGainControlFromNleParameters(parameters, {
      itemId: item.id,
      durationFrames: item.durationFrames,
      frameRate: project.frameRate,
    })) };
  },
};

export const audioGainNleAuthoring: NleEffectParameterAuthoring = {
  effect: audioGainNleSymbol,
  inspect: ({ effect, item, medium }) => {
    if (medium !== "audio") throw new Error("Audio Gain must belong to an Audio effect chain.");
    const parameters = effect.parameters as unknown;
    assertAudioGainNleParameters(parameters, item.durationFrames);
    return canonicalize(parameters);
  },
  edit: (operation, { effect, item, medium }) => {
    if (medium !== "audio") throw new Error("Audio Gain must belong to an Audio effect chain.");
    const parameters = effect.parameters as unknown;
    assertAudioGainNleParameters(parameters, item.durationFrames);
    return canonicalize(editAudioGainNleParameters(
      parameters,
      operation as unknown as AudioGainNleEdit,
      item.durationFrames,
    ));
  },
};
