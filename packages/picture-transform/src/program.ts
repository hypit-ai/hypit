import {
  assertTemporalControl,
  evaluateTemporalControl,
  pointwiseOperatorTemporalSupport,
  type PictureOperator,
  type TemporalControl,
} from "@hypit/audiovisual";
import { htmlVisual } from "@hypit/html-program";
import type { ExactTemporalValue, Rational } from "@hypit/temporal/algebra";

/** One complete, local affine pose. Opacity remains the concern of Picture Filter. */
export type PictureTransformState = {
  readonly translateX: number;
  readonly translateY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotationDegrees: number;
  /** Normalized transform origin in the Item rectangle. Values outside 0..1 are intentional. */
  readonly originX: number;
  readonly originY: number;
};

export type PictureTransformInterpolation = {
  readonly kind: "linear" | "ease-in" | "ease-out" | "ease-in-out";
};
export type PictureTransformControl = TemporalControl<PictureTransformState, PictureTransformInterpolation>;

export const IDENTITY_PICTURE_TRANSFORM: PictureTransformState = {
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
  rotationDegrees: 0,
  originX: 0.5,
  originY: 0.5,
};

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

export function assertPictureTransformState(value: PictureTransformState, label = "Picture Transform state"): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join("\u0000") !== [
      "originX", "originY", "rotationDegrees", "scaleX", "scaleY", "translateX", "translateY",
    ].sort().join("\u0000")) {
    throw new Error(`${label} has invalid fields.`);
  }
  for (const name of Object.keys(IDENTITY_PICTURE_TRANSFORM) as (keyof PictureTransformState)[]) {
    finite(value[name], `${label}.${name}`);
  }
}

export function assertPictureTransformControl(value: PictureTransformControl): void {
  assertTemporalControl(value, assertPictureTransformState, (interpolation, label) => {
    if (!["linear", "ease-in", "ease-out", "ease-in-out"].includes(interpolation.kind)) {
      throw new Error(`${label}.kind is invalid.`);
    }
  });
}

export function sealPictureTransformControl(value: PictureTransformControl): PictureTransformControl {
  assertPictureTransformControl(value);
  return structuredClone(value);
}

function rationalNumber(value: Rational): number {
  const scale = 1_000_000_000_000_000n;
  return Number(value.numerator * scale / value.denominator) / Number(scale);
}

function interpolateState(
  from: PictureTransformState,
  to: PictureTransformState,
  progress: Rational,
  interpolation: PictureTransformInterpolation,
): PictureTransformState {
  const raw = rationalNumber(progress);
  const ratio = interpolation.kind === "linear" ? raw
    : interpolation.kind === "ease-in" ? raw ** 3
    : interpolation.kind === "ease-out" ? 1 - (1 - raw) ** 3
    : raw < 0.5 ? 4 * raw ** 3 : 1 - ((-2 * raw + 2) ** 3) / 2;
  const between = (name: keyof PictureTransformState): number => from[name] + (to[name] - from[name]) * ratio;
  return {
    translateX: between("translateX"),
    translateY: between("translateY"),
    scaleX: between("scaleX"),
    scaleY: between("scaleY"),
    rotationDegrees: between("rotationDegrees"),
    originX: between("originX"),
    originY: between("originY"),
  };
}

export function evaluatePictureTransformControl(
  value: PictureTransformControl,
  at: ExactTemporalValue,
): PictureTransformState {
  assertPictureTransformControl(value);
  return evaluateTemporalControl(value, at, (from, to, progress, interpolation) =>
    interpolateState(from, to, progress, interpolation));
}

function pictureTransformProgram(
  value:
    | { readonly kind: "constant"; readonly state: PictureTransformState }
    | { readonly kind: "control"; readonly control: PictureTransformControl },
): PictureOperator["program"] {
  return htmlVisual({
    html: '<div data-hypit-picture-transform-layer>{{picture}}</div>',
    css: `:scope { position: absolute; inset: 0; overflow: visible; }
:scope > [data-hypit-picture-transform-layer] { position: absolute; inset: 0; will-change: transform; }`,
    data: structuredClone(value),
    setup: `const layer = root.querySelector('[data-hypit-picture-transform-layer]');
if (layer === null) throw new Error('Picture Transform requires its Picture layer.');
const seconds = value => Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
const mix = (from, to, progress) => from + (to - from) * progress;
const ease = (progress, kind) => kind === 'linear' ? progress
  : kind === 'ease-in' ? progress ** 3
  : kind === 'ease-out' ? 1 - (1 - progress) ** 3
  : progress < 0.5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2;
const interpolate = (from, to, progress) => ({
  translateX: mix(from.translateX, to.translateX, progress),
  translateY: mix(from.translateY, to.translateY, progress),
  scaleX: mix(from.scaleX, to.scaleX, progress),
  scaleY: mix(from.scaleY, to.scaleY, progress),
  rotationDegrees: mix(from.rotationDegrees, to.rotationDegrees, progress),
  originX: mix(from.originX, to.originX, progress),
  originY: mix(from.originY, to.originY, progress),
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
  layer.style.transformOrigin = \`${'${state.originX * 100}'}% ${'${state.originY * 100}'}%\`;
  layer.style.transform = \`translate(${'${state.translateX}'}px, ${'${state.translateY}'}px) rotate(${'${state.rotationDegrees}'}deg) scale(${'${state.scaleX}'}, ${'${state.scaleY}'})\`;
};
return localFrame => apply(data.kind === 'constant'
  ? data.state
  : controlledState(context.controlPosition('transform', localFrame)));`,
  });
}

export function pictureTransformOperator(state: PictureTransformState): PictureOperator {
  assertPictureTransformState(state);
  return {
    id: "hypit.picture-transform:transform",
    inputs: ["picture"],
    temporalControls: {},
    temporalSupport: pointwiseOperatorTemporalSupport(["picture"]),
    program: pictureTransformProgram({ kind: "constant", state: structuredClone(state) }),
  };
}

export function pictureTransformControlOperator(control: PictureTransformControl): PictureOperator {
  const value = sealPictureTransformControl(control);
  return {
    id: "hypit.picture-transform:transform-control",
    inputs: ["picture"],
    temporalControls: { transform: structuredClone(value.domain) },
    temporalSupport: pointwiseOperatorTemporalSupport(["picture"]),
    program: pictureTransformProgram({ kind: "control", control: value }),
  };
}
