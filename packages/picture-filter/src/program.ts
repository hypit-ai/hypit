import {
  assertTemporalControl,
  evaluateTemporalControl,
  pointwiseOperatorTemporalSupport,
  type PictureOperator,
  type TemporalControl,
} from "@hypit/audiovisual";
import { htmlVisual } from "@hypit/html-program";
import type { ExactTemporalValue, Rational } from "@hypit/temporal/algebra";

export type PictureFilterState = {
  readonly opacity: number;
  readonly blurRadius: number;
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly hue: number;
  readonly grayscale: number;
  readonly sepia: number;
  readonly invert: number;
};

export type PictureFilterInterpolation = {
  readonly kind: "linear" | "ease-in" | "ease-out" | "ease-in-out";
};
export type PictureFilterControl = TemporalControl<PictureFilterState, PictureFilterInterpolation>;

export const IDENTITY_PICTURE_FILTER: PictureFilterState = {
  opacity: 1,
  blurRadius: 0,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
};

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function nonNegative(value: number, label: string): void {
  finite(value, label);
  if (value < 0) throw new Error(`${label} must not be negative.`);
}

function unit(value: number, label: string): void {
  finite(value, label);
  if (value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1.`);
}

export function assertPictureFilterState(value: PictureFilterState, label = "Picture Filter state"): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join("\u0000") !== [
      "blurRadius", "brightness", "contrast", "grayscale", "hue",
      "invert", "opacity", "saturation", "sepia",
    ].sort().join("\u0000")) {
    throw new Error(`${label} has invalid fields.`);
  }
  unit(value.opacity, `${label}.opacity`);
  nonNegative(value.blurRadius, `${label}.blurRadius`);
  nonNegative(value.brightness, `${label}.brightness`);
  nonNegative(value.contrast, `${label}.contrast`);
  nonNegative(value.saturation, `${label}.saturation`);
  finite(value.hue, `${label}.hue`);
  unit(value.grayscale, `${label}.grayscale`);
  unit(value.sepia, `${label}.sepia`);
  unit(value.invert, `${label}.invert`);
}

export function assertPictureFilterControl(value: PictureFilterControl): void {
  assertTemporalControl(value, assertPictureFilterState, (interpolation, label) => {
    if (!["linear", "ease-in", "ease-out", "ease-in-out"].includes(interpolation.kind)) {
      throw new Error(`${label}.kind is invalid.`);
    }
  });
}

export function sealPictureFilterControl(value: PictureFilterControl): PictureFilterControl {
  assertPictureFilterControl(value);
  return structuredClone(value);
}

function rationalNumber(value: Rational): number {
  const scale = 1_000_000_000_000_000n;
  return Number(value.numerator * scale / value.denominator) / Number(scale);
}

function interpolateState(
  from: PictureFilterState,
  to: PictureFilterState,
  progress: Rational,
  interpolation: PictureFilterInterpolation,
): PictureFilterState {
  const raw = rationalNumber(progress);
  const ratio = interpolation.kind === "linear" ? raw
    : interpolation.kind === "ease-in" ? raw ** 3
    : interpolation.kind === "ease-out" ? 1 - (1 - raw) ** 3
    : raw < 0.5 ? 4 * raw ** 3 : 1 - ((-2 * raw + 2) ** 3) / 2;
  const between = (name: keyof PictureFilterState): number =>
    from[name] + (to[name] - from[name]) * ratio;
  return {
    opacity: between("opacity"),
    blurRadius: between("blurRadius"),
    brightness: between("brightness"),
    contrast: between("contrast"),
    saturation: between("saturation"),
    hue: between("hue"),
    grayscale: between("grayscale"),
    sepia: between("sepia"),
    invert: between("invert"),
  };
}

export function evaluatePictureFilterControl(
  value: PictureFilterControl,
  at: ExactTemporalValue,
): PictureFilterState {
  assertPictureFilterControl(value);
  return evaluateTemporalControl(value, at, (from, to, progress, interpolation) =>
    interpolateState(from, to, progress, interpolation));
}

function pictureFilterProgram(
  value:
    | { readonly kind: "constant"; readonly state: PictureFilterState }
    | { readonly kind: "control"; readonly control: PictureFilterControl },
): PictureOperator["program"] {
  return htmlVisual({
    html: '<div data-hypit-picture-filter-layer>{{picture}}</div>',
    css: `:scope { position: absolute; inset: 0; overflow: visible; }
:scope > [data-hypit-picture-filter-layer] { position: absolute; inset: 0; }`,
    data: structuredClone(value),
    setup: `const layer = root.querySelector('[data-hypit-picture-filter-layer]');
if (layer === null) throw new Error('Picture Filter requires its Picture layer.');
const seconds = value => Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
const mix = (from, to, progress) => from + (to - from) * progress;
const ease = (progress, kind) => kind === 'linear' ? progress
  : kind === 'ease-in' ? progress ** 3
  : kind === 'ease-out' ? 1 - (1 - progress) ** 3
  : progress < 0.5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2;
const interpolate = (from, to, progress) => ({
  opacity: mix(from.opacity, to.opacity, progress),
  blurRadius: mix(from.blurRadius, to.blurRadius, progress),
  brightness: mix(from.brightness, to.brightness, progress),
  contrast: mix(from.contrast, to.contrast, progress),
  saturation: mix(from.saturation, to.saturation, progress),
  hue: mix(from.hue, to.hue, progress),
  grayscale: mix(from.grayscale, to.grayscale, progress),
  sepia: mix(from.sepia, to.sepia, progress),
  invert: mix(from.invert, to.invert, progress),
});
const controlledState = position => {
  const segments = data.control.segments;
  if (position === undefined) return segments[0].from;
  const at = seconds(position);
  const segment = segments.find(candidate => at >= seconds(candidate.range.start)
    && at < seconds(candidate.range.end)) ?? segments[segments.length - 1];
  const start = seconds(segment.range.start);
  const duration = seconds(segment.range.end) - start;
  const rawProgress = duration === 0 ? 1 : Math.max(0, Math.min(1, (at - start) / duration));
  const progress = ease(rawProgress, segment.interpolation.kind);
  return interpolate(segment.from, segment.to, progress);
};
const apply = state => {
  layer.style.opacity = String(state.opacity);
  layer.style.filter = [
    \`blur(\${state.blurRadius}px)\`,
    \`brightness(\${state.brightness})\`,
    \`contrast(\${state.contrast})\`,
    \`saturate(\${state.saturation})\`,
    \`hue-rotate(\${state.hue}deg)\`,
    \`grayscale(\${state.grayscale})\`,
    \`sepia(\${state.sepia})\`,
    \`invert(\${state.invert})\`,
  ].join(' ');
};
return localFrame => apply(data.kind === 'constant'
  ? data.state
  : controlledState(context.controlPosition('filter', localFrame)));`,
  });
}

export function pictureFilterOperator(state: PictureFilterState): PictureOperator {
  assertPictureFilterState(state);
  return {
    id: "hypit.picture-filter:filter",
    inputs: ["picture"],
    temporalControls: {},
    temporalSupport: pointwiseOperatorTemporalSupport(["picture"]),
    program: pictureFilterProgram({ kind: "constant", state: structuredClone(state) }),
  };
}

export function pictureFilterControlOperator(control: PictureFilterControl): PictureOperator {
  const value = sealPictureFilterControl(control);
  return {
    id: "hypit.picture-filter:filter-control",
    inputs: ["picture"],
    temporalControls: { filter: structuredClone(value.domain) },
    temporalSupport: pointwiseOperatorTemporalSupport(["picture"]),
    program: pictureFilterProgram({ kind: "control", control: value }),
  };
}
