import type {
  NleEffectParameterAuthoring,
  NleEffectResolver,
  NlePackageSymbol,
} from "@hypit/nle";
import { canonicalize } from "@hypit/protocol";
import { sealLocalTemporalDomain } from "@hypit/temporal/algebra";
import { exactTemporalValueFromFrames } from "@hypit/temporal/sampling";

import { pictureFilterModuleRef } from "./manifest.js";
import {
  assertPictureFilterState,
  pictureFilterControlOperator,
  pictureFilterOperator,
  sealPictureFilterControl,
  type PictureFilterControl,
  type PictureFilterState,
} from "./program.js";

export type PictureFilterNleFrame = {
  readonly atFrame: number;
  readonly state: PictureFilterState;
};

/** Package-owned NLE parameter spelling; NLE Core only stores this as CanonicalValue. */
export type PictureFilterNleParameters =
  | { readonly kind: "constant"; readonly state: PictureFilterState }
  | {
      readonly kind: "frames";
      readonly frames: readonly PictureFilterNleFrame[];
      readonly interpolation: { readonly kind: "linear" };
    };

export type PictureFilterNleEdit =
  | { readonly kind: "set-constant-state"; readonly state: PictureFilterState }
  | { readonly kind: "set-frame-state"; readonly atFrame: number; readonly state: PictureFilterState };

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
  durationFrames?: number,
): asserts value is PictureFilterNleParameters {
  const label = "NLE Picture Filter parameters";
  record(value, label);
  if (value.kind === "constant") {
    exactFields(value, ["kind", "state"], label);
    assertPictureFilterState(value.state as PictureFilterState, `${label}.state`);
    return;
  }
  if (value.kind !== "frames") throw new Error(`${label}.kind is invalid.`);
  exactFields(value, ["frames", "interpolation", "kind"], label);
  record(value.interpolation, `${label}.interpolation`);
  exactFields(value.interpolation, ["kind"], `${label}.interpolation`);
  if (value.interpolation.kind !== "linear") {
    throw new Error(`${label}.interpolation.kind is invalid.`);
  }
  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    throw new Error(`${label}.frames must contain at least one frame.`);
  }
  let previous = -1;
  for (const [index, candidate] of value.frames.entries()) {
    const frameLabel = `${label}.frames[${index}]`;
    record(candidate, frameLabel);
    exactFields(candidate, ["atFrame", "state"], frameLabel);
    const atFrame = candidate.atFrame;
    if (typeof atFrame !== "number" || !Number.isSafeInteger(atFrame) || atFrame < 0
      || atFrame <= previous) {
      throw new Error(`${frameLabel}.atFrame must be a strictly increasing non-negative safe integer.`);
    }
    if (durationFrames !== undefined && atFrame >= durationFrames) {
      throw new Error(`${frameLabel}.atFrame must lie inside the Item duration.`);
    }
    if (index === 0 && atFrame !== 0) {
      throw new Error(`${label}.frames must begin at Item-local frame 0.`);
    }
    assertPictureFilterState(candidate.state as PictureFilterState, `${frameLabel}.state`);
    previous = atFrame;
  }
}

export function pictureFilterControlFromNleParameters(
  parameters: Extract<PictureFilterNleParameters, { readonly kind: "frames" }>,
  input: {
    readonly itemId: string;
    readonly durationFrames: number;
    readonly frameRate: { readonly numerator: number; readonly denominator: number };
  },
): PictureFilterControl {
  assertPictureFilterNleParameters(parameters, input.durationFrames);
  const domain = sealLocalTemporalDomain({
    id: `${input.itemId}:time`,
    duration: exactTemporalValueFromFrames(input.durationFrames, { frameRate: input.frameRate }),
  });
  return sealPictureFilterControl({
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
        from: structuredClone(frame.state),
        to: structuredClone(next?.state ?? frame.state),
        interpolation: { kind: "linear" as const },
      };
    }),
  });
}

export function editPictureFilterNleParameters(
  parameters: PictureFilterNleParameters,
  operation: PictureFilterNleEdit,
  durationFrames: number,
): PictureFilterNleParameters {
  assertPictureFilterNleParameters(parameters, durationFrames);
  record(operation, "NLE Picture Filter edit");
  if (operation.kind === "set-constant-state") {
    exactFields(operation, ["kind", "state"], "NLE Picture Filter edit");
    assertPictureFilterState(operation.state, "NLE Picture Filter edit.state");
    return { kind: "constant", state: structuredClone(operation.state) };
  }
  if (operation.kind !== "set-frame-state") throw new Error("NLE Picture Filter edit.kind is invalid.");
  exactFields(operation, ["atFrame", "kind", "state"], "NLE Picture Filter edit");
  if (parameters.kind !== "frames") {
    throw new Error("NLE Picture Filter frame edit requires frame parameters.");
  }
  if (!Number.isSafeInteger(operation.atFrame) || operation.atFrame < 0
    || operation.atFrame >= durationFrames) {
    throw new Error("NLE Picture Filter edit.atFrame must lie inside the Item duration.");
  }
  assertPictureFilterState(operation.state, "NLE Picture Filter edit.state");
  const frames = parameters.frames.filter((frame) => frame.atFrame !== operation.atFrame);
  frames.push({ atFrame: operation.atFrame, state: structuredClone(operation.state) });
  frames.sort((left, right) => left.atFrame - right.atFrame);
  const next: PictureFilterNleParameters = {
    kind: "frames",
    frames,
    interpolation: structuredClone(parameters.interpolation),
  };
  assertPictureFilterNleParameters(next, durationFrames);
  return next;
}

/** NLE instance parameters and their interpolation remain package-owned. */
export const pictureFilterNleResolver: NleEffectResolver = {
  effect: pictureFilterNleSymbol,
  resolve: (effect, item, { project }) => {
    const parameters = effect.parameters as unknown;
    assertPictureFilterNleParameters(parameters, item.durationFrames);
    if (parameters.kind === "constant") {
      return { operator: pictureFilterOperator(parameters.state) };
    }
    return { operator: pictureFilterControlOperator(pictureFilterControlFromNleParameters(parameters, {
      itemId: item.id,
      durationFrames: item.durationFrames,
      frameRate: project.frameRate,
    })) };
  },
};

export const pictureFilterNleAuthoring: NleEffectParameterAuthoring = {
  effect: pictureFilterNleSymbol,
  inspect: ({ effect, item }) => {
    const parameters = effect.parameters as unknown;
    assertPictureFilterNleParameters(parameters, item.durationFrames);
    return canonicalize(parameters);
  },
  edit: (operation, { effect, item }) => {
    const parameters = effect.parameters as unknown;
    assertPictureFilterNleParameters(parameters, item.durationFrames);
    return canonicalize(editPictureFilterNleParameters(
      parameters,
      operation as unknown as PictureFilterNleEdit,
      item.durationFrames,
    ));
  },
};
