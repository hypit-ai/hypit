import type {
  NleAdjustmentParameterAuthoring,
  NlePackageSymbol,
  NlePictureAdjustmentResolver,
} from "@hypit/nle";
import { canonicalize } from "@hypit/protocol";
import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  sealLocalTemporalDomain,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";

import { pictureTransformModuleRef } from "./manifest.js";
import {
  assertPictureTransformState,
  pictureTransformControlOperator,
  pictureTransformOperator,
  sealPictureTransformControl,
  type PictureTransformControl,
  type PictureTransformInterpolation,
  type PictureTransformState,
} from "./program.js";

export type PictureTransformNleKeyframe = {
  readonly at: ExactTemporalValue;
  readonly state: PictureTransformState;
};

export type PictureTransformNleParameters =
  | { readonly kind: "constant"; readonly state: PictureTransformState }
  | {
      readonly kind: "keyframes";
      readonly keyframes: readonly PictureTransformNleKeyframe[];
      readonly interpolation: PictureTransformInterpolation;
    };

export type PictureTransformNleEdit =
  | { readonly kind: "set-constant-state"; readonly state: PictureTransformState }
  | { readonly kind: "set-keyframe-state"; readonly at: ExactTemporalValue; readonly state: PictureTransformState };

export const pictureTransformNleSymbol: NlePackageSymbol = {
  module: pictureTransformModuleRef,
  name: "transform",
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

export function assertPictureTransformNleParameters(
  value: unknown,
  duration?: ExactTemporalValue,
): asserts value is PictureTransformNleParameters {
  const label = "NLE Picture Transform parameters";
  record(value, label);
  if (value.kind === "constant") {
    exactFields(value, ["kind", "state"], label);
    assertPictureTransformState(value.state as PictureTransformState, `${label}.state`);
    return;
  }
  if (value.kind !== "keyframes") throw new Error(`${label}.kind is invalid.`);
  exactFields(value, ["interpolation", "keyframes", "kind"], label);
  record(value.interpolation, `${label}.interpolation`);
  exactFields(value.interpolation, ["kind"], `${label}.interpolation`);
  if (!["linear", "ease-in", "ease-out", "ease-in-out"].includes(value.interpolation.kind as string)) {
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
    assertPictureTransformState(candidate.state as PictureTransformState, `${keyframeLabel}.state`);
    previous = at;
  }
}

export function pictureTransformControlFromNleParameters(
  parameters: Extract<PictureTransformNleParameters, { readonly kind: "keyframes" }>,
  input: { readonly itemId: string; readonly duration: ExactTemporalValue },
): PictureTransformControl {
  assertPictureTransformNleParameters(parameters, input.duration);
  const domain = sealLocalTemporalDomain({
    id: `${input.itemId}:time`,
    duration: structuredClone(input.duration),
  });
  return sealPictureTransformControl({
    domain,
    segments: parameters.keyframes.map((keyframe, index) => {
      const next = parameters.keyframes[index + 1];
      return {
        range: { start: structuredClone(keyframe.at), end: structuredClone(next?.at ?? input.duration) },
        from: structuredClone(keyframe.state),
        to: structuredClone(next?.state ?? keyframe.state),
        interpolation: structuredClone(parameters.interpolation),
      };
    }),
  });
}

export function editPictureTransformNleParameters(
  parameters: PictureTransformNleParameters,
  operation: PictureTransformNleEdit,
  duration: ExactTemporalValue,
): PictureTransformNleParameters {
  assertPictureTransformNleParameters(parameters, duration);
  record(operation, "NLE Picture Transform edit");
  if (operation.kind === "set-constant-state") {
    exactFields(operation, ["kind", "state"], "NLE Picture Transform edit");
    assertPictureTransformState(operation.state, "NLE Picture Transform edit.state");
    return { kind: "constant", state: structuredClone(operation.state) };
  }
  if (operation.kind !== "set-keyframe-state") throw new Error("NLE Picture Transform edit.kind is invalid.");
  exactFields(operation, ["at", "kind", "state"], "NLE Picture Transform edit");
  if (parameters.kind !== "keyframes") {
    throw new Error("NLE Picture Transform keyframe edit requires keyframe parameters.");
  }
  assertExactTemporalValue(operation.at, "NLE Picture Transform edit.at");
  if (compareExactTemporalValues(operation.at, exactTemporalZero()) < 0
    || compareExactTemporalValues(operation.at, duration) >= 0) {
    throw new Error("NLE Picture Transform edit.at must lie inside the Item duration.");
  }
  assertPictureTransformState(operation.state, "NLE Picture Transform edit.state");
  const keyframes = parameters.keyframes.filter((keyframe) =>
    compareExactTemporalValues(keyframe.at, operation.at) !== 0);
  keyframes.push({ at: structuredClone(operation.at), state: structuredClone(operation.state) });
  keyframes.sort((left, right) => compareExactTemporalValues(left.at, right.at));
  const next: PictureTransformNleParameters = {
    kind: "keyframes",
    keyframes,
    interpolation: structuredClone(parameters.interpolation),
  };
  assertPictureTransformNleParameters(next, duration);
  return next;
}

export const pictureTransformNleResolver: NlePictureAdjustmentResolver = {
  component: pictureTransformNleSymbol,
  resolve: (item) => {
    const parameters = item.parameters as unknown;
    assertPictureTransformNleParameters(parameters, item.duration);
    return parameters.kind === "constant"
      ? { operator: pictureTransformOperator(parameters.state) }
      : { operator: pictureTransformControlOperator(pictureTransformControlFromNleParameters(parameters, {
          itemId: item.id,
          duration: item.duration,
        })) };
  },
};

export const pictureTransformNleAuthoring: NleAdjustmentParameterAuthoring = {
  component: pictureTransformNleSymbol,
  inspect: ({ item }) => {
    const parameters = item.parameters as unknown;
    assertPictureTransformNleParameters(parameters, item.duration);
    return canonicalize(parameters);
  },
  edit: (operation, { item }) => {
    const parameters = item.parameters as unknown;
    assertPictureTransformNleParameters(parameters, item.duration);
    return canonicalize(editPictureTransformNleParameters(
      parameters,
      operation as unknown as PictureTransformNleEdit,
      item.duration,
    ));
  },
};
