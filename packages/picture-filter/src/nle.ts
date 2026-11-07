import type {
  NleEffectParameterAuthoring,
  NleEffectResolver,
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

import { pictureFilterModuleRef } from "./manifest.js";
import {
  assertPictureFilterState,
  pictureFilterControlOperator,
  pictureFilterOperator,
  sealPictureFilterControl,
  type PictureFilterControl,
  type PictureFilterState,
} from "./program.js";

export type PictureFilterNleKeyframe = {
  readonly at: ExactTemporalValue;
  readonly state: PictureFilterState;
};

/** Package-owned NLE parameter spelling; NLE Core only stores this as CanonicalValue. */
export type PictureFilterNleParameters =
  | { readonly kind: "constant"; readonly state: PictureFilterState }
  | {
      readonly kind: "keyframes";
      readonly keyframes: readonly PictureFilterNleKeyframe[];
      readonly interpolation: { readonly kind: "linear" };
    };

export type PictureFilterNleEdit =
  | { readonly kind: "set-constant-state"; readonly state: PictureFilterState }
  | { readonly kind: "set-keyframe-state"; readonly at: ExactTemporalValue; readonly state: PictureFilterState };

export const pictureFilterNleSymbol: NlePackageSymbol = {
  module: pictureFilterModuleRef,
  name: "filter",
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

export function assertPictureFilterNleParameters(
  value: unknown,
  duration?: ExactTemporalValue,
): asserts value is PictureFilterNleParameters {
  const label = "NLE Picture Filter parameters";
  record(value, label);
  if (value.kind === "constant") {
    exactFields(value, ["kind", "state"], label);
    assertPictureFilterState(value.state as PictureFilterState, `${label}.state`);
    return;
  }
  if (value.kind !== "keyframes") throw new Error(`${label}.kind is invalid.`);
  exactFields(value, ["interpolation", "keyframes", "kind"], label);
  record(value.interpolation, `${label}.interpolation`);
  exactFields(value.interpolation, ["kind"], `${label}.interpolation`);
  if (value.interpolation.kind !== "linear") {
    throw new Error(`${label}.interpolation.kind is invalid.`);
  }
  if (!Array.isArray(value.keyframes) || value.keyframes.length === 0) {
    throw new Error(`${label}.keyframes must contain at least one keyframe.`);
  }
  let previous: ExactTemporalValue | undefined;
  for (const [index, candidate] of value.keyframes.entries()) {
    const keyframeLabel = `${label}.keyframes[${index}]`;
    record(candidate, keyframeLabel);
    exactFields(candidate, ["at", "state"], keyframeLabel);
    assertExactTemporalValue(candidate.at as ExactTemporalValue, `${keyframeLabel}.at`);
    const at = candidate.at as ExactTemporalValue;
    if (compareExactTemporalValues(at, exactTemporalZero()) < 0
      || (previous !== undefined && compareExactTemporalValues(at, previous) <= 0)) {
      throw new Error(`${keyframeLabel}.at must be a strictly increasing non-negative exact time.`);
    }
    if (duration !== undefined && compareExactTemporalValues(at, duration) >= 0) {
      throw new Error(`${keyframeLabel}.at must lie inside the Item duration.`);
    }
    if (index === 0 && compareExactTemporalValues(at, exactTemporalZero()) !== 0) {
      throw new Error(`${label}.keyframes must begin at Item-local time zero.`);
    }
    assertPictureFilterState(candidate.state as PictureFilterState, `${keyframeLabel}.state`);
    previous = at;
  }
}

export function pictureFilterControlFromNleParameters(
  parameters: Extract<PictureFilterNleParameters, { readonly kind: "keyframes" }>,
  input: {
    readonly itemId: string;
    readonly duration: ExactTemporalValue;
  },
): PictureFilterControl {
  assertPictureFilterNleParameters(parameters, input.duration);
  const domain = sealLocalTemporalDomain({
    id: `${input.itemId}:time`,
    duration: structuredClone(input.duration),
  });
  return sealPictureFilterControl({
    domain,
    segments: parameters.keyframes.map((keyframe, index) => {
      const next = parameters.keyframes[index + 1];
      return {
        range: {
          start: structuredClone(keyframe.at),
          end: structuredClone(next?.at ?? input.duration),
        },
        from: structuredClone(keyframe.state),
        to: structuredClone(next?.state ?? keyframe.state),
        interpolation: { kind: "linear" as const },
      };
    }),
  });
}

export function editPictureFilterNleParameters(
  parameters: PictureFilterNleParameters,
  operation: PictureFilterNleEdit,
  duration: ExactTemporalValue,
): PictureFilterNleParameters {
  assertPictureFilterNleParameters(parameters, duration);
  record(operation, "NLE Picture Filter edit");
  if (operation.kind === "set-constant-state") {
    exactFields(operation, ["kind", "state"], "NLE Picture Filter edit");
    assertPictureFilterState(operation.state, "NLE Picture Filter edit.state");
    return { kind: "constant", state: structuredClone(operation.state) };
  }
  if (operation.kind !== "set-keyframe-state") throw new Error("NLE Picture Filter edit.kind is invalid.");
  exactFields(operation, ["at", "kind", "state"], "NLE Picture Filter edit");
  if (parameters.kind !== "keyframes") {
    throw new Error("NLE Picture Filter keyframe edit requires keyframe parameters.");
  }
  assertExactTemporalValue(operation.at, "NLE Picture Filter edit.at");
  if (compareExactTemporalValues(operation.at, exactTemporalZero()) < 0
    || compareExactTemporalValues(operation.at, duration) >= 0) {
    throw new Error("NLE Picture Filter edit.at must lie inside the Item duration.");
  }
  assertPictureFilterState(operation.state, "NLE Picture Filter edit.state");
  const keyframes = parameters.keyframes.filter((keyframe) =>
    compareExactTemporalValues(keyframe.at, operation.at) !== 0);
  keyframes.push({ at: structuredClone(operation.at), state: structuredClone(operation.state) });
  keyframes.sort((left, right) => compareExactTemporalValues(left.at, right.at));
  const next: PictureFilterNleParameters = {
    kind: "keyframes",
    keyframes,
    interpolation: structuredClone(parameters.interpolation),
  };
  assertPictureFilterNleParameters(next, duration);
  return next;
}

/** NLE instance parameters and their interpolation remain package-owned. */
export const pictureFilterNleResolver: NleEffectResolver = {
  effect: pictureFilterNleSymbol,
  resolve: (effect, item) => {
    const parameters = effect.parameters as unknown;
    assertPictureFilterNleParameters(parameters, item.duration);
    if (parameters.kind === "constant") {
      return { operator: pictureFilterOperator(parameters.state) };
    }
    return { operator: pictureFilterControlOperator(pictureFilterControlFromNleParameters(parameters, {
      itemId: item.id,
      duration: item.duration,
    })) };
  },
};

export const pictureFilterNleAuthoring: NleEffectParameterAuthoring = {
  effect: pictureFilterNleSymbol,
  inspect: ({ effect, item }) => {
    const parameters = effect.parameters as unknown;
    assertPictureFilterNleParameters(parameters, item.duration);
    return canonicalize(parameters);
  },
  edit: (operation, { effect, item }) => {
    const parameters = effect.parameters as unknown;
    assertPictureFilterNleParameters(parameters, item.duration);
    return canonicalize(editPictureFilterNleParameters(
      parameters,
      operation as unknown as PictureFilterNleEdit,
      item.duration,
    ));
  },
};
