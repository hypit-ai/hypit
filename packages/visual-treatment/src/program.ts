import { htmlAdjustment, type HtmlAdjustmentKeyframe } from "@hypit/html-program";
import type { VisualAdjustmentEffect } from "@hypit/visual-adjustment";

export type TreatmentEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";
export type TreatmentKeyframe<T> = T & { readonly at: number; readonly easing?: TreatmentEasing };

export type TransformTreatment = {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotation: number;
  readonly originX: number;
  readonly originY: number;
};

export type ColorTreatment = {
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly hue: number;
  readonly grayscale: number;
  readonly sepia: number;
  readonly invert: number;
};

const identity = {
  filter: "none",
  opacity: 1,
  transform: "none",
  transformOrigin: "50% 50%",
} as const;

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
}

function range(value: number, minimum: number, maximum: number, label: string): void {
  finite(value, label);
  if (value < minimum || value > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
}

function easing(value: TreatmentEasing | undefined): void {
  if (value !== undefined && !["linear", "ease-in", "ease-out", "ease-in-out"].includes(value)) {
    throw new Error(`Treatment easing ${value} is invalid.`);
  }
}

function effect<T>(
  states: readonly TreatmentKeyframe<T>[],
  convert: (state: TreatmentKeyframe<T>) => HtmlAdjustmentKeyframe,
): VisualAdjustmentEffect {
  if (states.length === 0) throw new Error("Visual Treatment requires at least one state.");
  return htmlAdjustment({ keyframes: states.map((state) => {
    range(state.at, 0, 1, "Treatment keyframe position");
    easing(state.easing);
    return convert(state);
  }) });
}

function common<T>(state: TreatmentKeyframe<T>) {
  return { at: state.at, ...(state.easing === undefined ? {} : { easing: state.easing }) };
}

export function transformTreatment(
  states: readonly TreatmentKeyframe<TransformTreatment>[],
): VisualAdjustmentEffect {
  return effect(states, (state) => {
    for (const [name, value] of Object.entries(state)) if (name !== "easing") finite(value as number, `Transform ${name}`);
    return {
      ...common(state),
      ...identity,
      transform: `translate(${state.x}px, ${state.y}px) rotate(${state.rotation}deg) scale(${state.scaleX}, ${state.scaleY})`,
      transformOrigin: `${state.originX * 100}% ${state.originY * 100}%`,
    };
  });
}

export function opacityTreatment(
  states: readonly TreatmentKeyframe<{ readonly value: number }>[],
): VisualAdjustmentEffect {
  return effect(states, (state) => {
    range(state.value, 0, 1, "Opacity value");
    return { ...common(state), ...identity, opacity: state.value };
  });
}

export function blurTreatment(
  states: readonly TreatmentKeyframe<{ readonly radius: number }>[],
): VisualAdjustmentEffect {
  return effect(states, (state) => {
    finite(state.radius, "Blur radius");
    if (state.radius < 0) throw new Error("Blur radius must not be negative.");
    return { ...common(state), ...identity, filter: `blur(${state.radius}px)` };
  });
}

/** Browser-sRGB basic colour operation with one explicit, stable internal order. */
export function colorTreatment(
  states: readonly TreatmentKeyframe<ColorTreatment>[],
): VisualAdjustmentEffect {
  return effect(states, (state) => {
    for (const [name, value] of Object.entries(state)) if (name !== "easing") finite(value as number, `Color ${name}`);
    if (state.brightness < 0 || state.contrast < 0 || state.saturation < 0) {
      throw new Error("Color brightness, contrast and saturation must not be negative.");
    }
    range(state.grayscale, 0, 1, "Color grayscale");
    range(state.sepia, 0, 1, "Color sepia");
    range(state.invert, 0, 1, "Color invert");
    return {
      ...common(state),
      ...identity,
      filter: [
        `brightness(${state.brightness})`,
        `contrast(${state.contrast})`,
        `saturate(${state.saturation})`,
        `hue-rotate(${state.hue}deg)`,
        `grayscale(${state.grayscale})`,
        `sepia(${state.sepia})`,
        `invert(${state.invert})`,
      ].join(" "),
    };
  });
}
