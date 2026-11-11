import type {
  NleAudioAdjustmentResolver,
  NleAdjustmentParameterAuthoring,
  NlePackageSymbol,
} from "@hypit/nle";
import { canonicalize } from "@hypit/protocol";
import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  sealLocalTemporalDomain,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";

import {
  audioGainControlOperator,
  audioGainOperator,
  sealAudioGainControl,
  type AudioGainControl,
} from "./gain.js";
import { audioGainModuleRef } from "./manifest.js";

export type AudioGainNleKeyframe = {
  readonly at: ExactTemporalValue;
  readonly gain: number;
};

/** Item-local NLE spelling owned by Audio Gain, not by NLE Core. */
export type AudioGainNleParameters =
  | { readonly kind: "constant"; readonly gain: number }
  | {
      readonly kind: "keyframes";
      readonly keyframes: readonly AudioGainNleKeyframe[];
      readonly interpolation: { readonly kind: "linear" };
    };

export type AudioGainNleEdit =
  | { readonly kind: "set-constant-gain"; readonly gain: number }
  | { readonly kind: "set-keyframe-gain"; readonly at: ExactTemporalValue; readonly gain: number };

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
  duration?: ExactTemporalValue,
): asserts value is AudioGainNleParameters {
  const label = "NLE Audio Gain parameters";
  record(value, label);
  if (value.kind === "constant") {
    exactFields(value, ["gain", "kind"], label);
    assertGain(value.gain, `${label}.gain`);
    return;
  }
  if (value.kind !== "keyframes") throw new Error(`${label}.kind is invalid.`);
  exactFields(value, ["interpolation", "keyframes", "kind"], label);
  record(value.interpolation, `${label}.interpolation`);
  exactFields(value.interpolation, ["kind"], `${label}.interpolation`);
  if (value.interpolation.kind !== "linear") throw new Error(`${label}.interpolation.kind is invalid.`);
  if (!Array.isArray(value.keyframes) || value.keyframes.length === 0) {
    throw new Error(`${label}.keyframes must contain at least one keyframe.`);
  }
  let previous: ExactTemporalValue | undefined;
  for (const [index, candidate] of value.keyframes.entries()) {
    const keyframeLabel = `${label}.keyframes[${index}]`;
    record(candidate, keyframeLabel);
    exactFields(candidate, ["at", "gain"], keyframeLabel);
    assertExactTemporalValue(candidate.at as ExactTemporalValue, `${keyframeLabel}.at`);
    const at = candidate.at as ExactTemporalValue;
    if (compareExactTemporalValues(at, exactTemporalZero()) < 0
      || (previous !== undefined && compareExactTemporalValues(at, previous) <= 0)) {
      throw new Error(`${keyframeLabel}.at must be a strictly increasing non-negative exact time.`);
    }
    if (index === 0 && compareExactTemporalValues(at, exactTemporalZero()) !== 0) {
      throw new Error(`${label}.keyframes must begin at Item-local time zero.`);
    }
    if (duration !== undefined && compareExactTemporalValues(at, duration) >= 0) {
      throw new Error(`${keyframeLabel}.at must lie inside the Item duration.`);
    }
    assertGain(candidate.gain, `${keyframeLabel}.gain`);
    previous = at;
  }
}

export function audioGainControlFromNleParameters(
  parameters: Extract<AudioGainNleParameters, { readonly kind: "keyframes" }>,
  input: {
    readonly itemId: string;
    readonly duration: ExactTemporalValue;
  },
): AudioGainControl {
  assertAudioGainNleParameters(parameters, input.duration);
  const domain = sealLocalTemporalDomain({
    id: `${input.itemId}:time`,
    duration: structuredClone(input.duration),
  });
  return sealAudioGainControl({
    domain,
    segments: parameters.keyframes.map((keyframe, index) => {
      const next = parameters.keyframes[index + 1];
      return {
        range: {
          start: structuredClone(keyframe.at),
          end: structuredClone(next?.at ?? input.duration),
        },
        from: keyframe.gain,
        to: next?.gain ?? keyframe.gain,
        interpolation: { kind: "linear" as const },
      };
    }),
  });
}

export function editAudioGainNleParameters(
  parameters: AudioGainNleParameters,
  operation: AudioGainNleEdit,
  duration: ExactTemporalValue,
): AudioGainNleParameters {
  assertAudioGainNleParameters(parameters, duration);
  record(operation, "NLE Audio Gain edit");
  if (operation.kind === "set-constant-gain") {
    exactFields(operation, ["gain", "kind"], "NLE Audio Gain edit");
    assertGain(operation.gain, "NLE Audio Gain edit.gain");
    return { kind: "constant", gain: operation.gain };
  }
  if (operation.kind !== "set-keyframe-gain") throw new Error("NLE Audio Gain edit.kind is invalid.");
  exactFields(operation, ["at", "gain", "kind"], "NLE Audio Gain edit");
  if (parameters.kind !== "keyframes") throw new Error("NLE Audio Gain keyframe edit requires keyframe parameters.");
  assertExactTemporalValue(operation.at, "NLE Audio Gain edit.at");
  if (compareExactTemporalValues(operation.at, exactTemporalZero()) < 0
    || compareExactTemporalValues(operation.at, duration) >= 0) {
    throw new Error("NLE Audio Gain edit.at must lie inside the Item duration.");
  }
  assertGain(operation.gain, "NLE Audio Gain edit.gain");
  const keyframes = parameters.keyframes.filter((keyframe) =>
    compareExactTemporalValues(keyframe.at, operation.at) !== 0);
  keyframes.push({ at: structuredClone(operation.at), gain: operation.gain });
  keyframes.sort((left, right) => compareExactTemporalValues(left.at, right.at));
  const next: AudioGainNleParameters = {
    kind: "keyframes",
    keyframes,
    interpolation: { kind: "linear" },
  };
  assertAudioGainNleParameters(next, duration);
  return next;
}

export const audioGainNleResolver: NleAudioAdjustmentResolver = {
  component: audioGainNleSymbol,
  resolve: (item) => {
    const parameters = item.parameters as unknown;
    assertAudioGainNleParameters(parameters, item.duration);
    if (parameters.kind === "constant") return { operator: audioGainOperator(parameters.gain) };
    return { operator: audioGainControlOperator(audioGainControlFromNleParameters(parameters, {
      itemId: item.id,
      duration: item.duration,
    })) };
  },
};

export const audioGainNleAuthoring: NleAdjustmentParameterAuthoring = {
  component: audioGainNleSymbol,
  inspect: ({ item, medium }) => {
    if (medium !== "audio") throw new Error("Audio Gain must belong to an Audio Track.");
    const parameters = item.parameters as unknown;
    assertAudioGainNleParameters(parameters, item.duration);
    return canonicalize(parameters);
  },
  edit: (operation, { item, medium }) => {
    if (medium !== "audio") throw new Error("Audio Gain must belong to an Audio Track.");
    const parameters = item.parameters as unknown;
    assertAudioGainNleParameters(parameters, item.duration);
    return canonicalize(editAudioGainNleParameters(
      parameters,
      operation as unknown as AudioGainNleEdit,
      item.duration,
    ));
  },
};
