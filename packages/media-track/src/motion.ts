import type {
  VisualAnimation,
  VisualEasing,
  VisualStyleDeclaration,
} from "@narratage/composition";

import type {
  MediaEdgeMotion,
  MediaLifecycleMotion,
  MediaMotionDirection,
  MediaSamplingMotion,
  MediaSustainMotion,
} from "./types.js";
import type { CanvasSpace, SpatialFrame } from "@narratage/spatial";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite.`);
}

function direction(value: MediaMotionDirection | undefined, label: string): void {
  if (value !== undefined) assert(["left", "right", "up", "down"].includes(value), `${label} is invalid.`);
}

export function assertMediaEdgeMotion(value: MediaEdgeMotion, label: string): void {
  assert(["fade", "slide", "scale", "pop", "bounce", "blur-reveal", "wipe", "flip", "spin"].includes(value.operator),
    `${label}.operator is invalid.`);
  assert(Number.isSafeInteger(value.durationFrames) && value.durationFrames > 0,
    `${label}.durationFrames must be positive.`);
  assert(["linear", "ease-in", "ease-out", "ease-in-out"].includes(value.easing), `${label}.easing is invalid.`);
  direction(value.direction, `${label}.direction`);
  if (["slide", "wipe", "flip"].includes(value.operator)) {
    assert(value.direction !== undefined, `${label}.${value.operator} requires direction.`);
  }
  if (value.amount !== undefined) finite(value.amount, `${label}.amount`);
  if (value.origin !== undefined) {
    assert(value.origin === "outside-canvas" && value.operator === "slide",
      `${label}.origin is supported only by slide.`);
    assert(value.amount === undefined, `${label} cannot combine amount with outside-canvas.`);
  }
}

function outsideCanvasAmount(directionValue: MediaMotionDirection, frame: SpatialFrame, canvas: CanvasSpace): number {
  if (directionValue === "left") return frame.xPx + frame.widthPx;
  if (directionValue === "right") return canvas.widthPx - frame.xPx;
  if (directionValue === "up") return frame.yPx + frame.heightPx;
  return canvas.heightPx - frame.yPx;
}

export function resolveMediaLifecycleMotion(
  value: MediaLifecycleMotion,
  frame: SpatialFrame,
  canvas: CanvasSpace,
): MediaLifecycleMotion {
  const edge = (motion: MediaEdgeMotion | undefined): MediaEdgeMotion | undefined => {
    if (motion === undefined || motion.origin === undefined) return motion === undefined ? undefined : structuredClone(motion);
    return {
      operator: motion.operator,
      durationFrames: motion.durationFrames,
      easing: motion.easing,
      ...(motion.direction === undefined ? {} : { direction: motion.direction }),
      amount: outsideCanvasAmount(motion.direction!, frame, canvas),
    };
  };
  return {
    ...(value.enter === undefined ? {} : { enter: edge(value.enter)! }),
    sustain: structuredClone(value.sustain),
    ...(value.exit === undefined ? {} : { exit: edge(value.exit)! }),
  };
}

export function assertMediaSustainMotion(value: MediaSustainMotion, label: string): void {
  assert(["float", "breathe", "pulse", "wobble", "shake", "drift"].includes(value.operator),
    `${label}.operator is invalid.`);
  finite(value.amount, `${label}.amount`);
  assert(value.amount >= 0, `${label}.amount must be non-negative.`);
  assert(Number.isSafeInteger(value.cycles) && value.cycles > 0 && value.cycles <= 100,
    `${label}.cycles must be inside [1, 100].`);
  direction(value.direction, `${label}.direction`);
  if (value.operator === "drift") assert(value.direction !== undefined, `${label}.drift requires direction.`);
}

export function assertMediaLifecycleMotion(value: MediaLifecycleMotion, durationFrames: number, label: string): void {
  assert(Number.isSafeInteger(durationFrames) && durationFrames > 0, `${label} duration is invalid.`);
  if (value.enter !== undefined) assertMediaEdgeMotion(value.enter, `${label}.enter`);
  if (value.exit !== undefined) assertMediaEdgeMotion(value.exit, `${label}.exit`);
  for (const [index, sustain] of value.sustain.entries()) assertMediaSustainMotion(sustain, `${label}.sustain.${index}`);
}

type MotionState = {
  readonly opacity: number;
  readonly transform: string;
  readonly filter: string;
  readonly clipPath: string;
};

const neutral: MotionState = {
  opacity: 1,
  transform: "none",
  filter: "none",
  clipPath: "inset(0% 0% 0% 0%)",
};

function translate(directionValue: MediaMotionDirection, amount: number): string {
  if (directionValue === "left") return `translateX(${-amount}px)`;
  if (directionValue === "right") return `translateX(${amount}px)`;
  if (directionValue === "up") return `translateY(${-amount}px)`;
  return `translateY(${amount}px)`;
}

function style(state: MotionState): VisualStyleDeclaration[] {
  return [
    { name: "clip-path", value: state.clipPath },
    { name: "filter", value: state.filter },
    { name: "opacity", value: state.opacity },
    { name: "transform", value: state.transform },
  ];
}

export function lifecycleAnimation(value: MediaLifecycleMotion, durationFrames: number): VisualAnimation | undefined {
  assertMediaLifecycleMotion(value, durationFrames, "Media lifecycle");
  if (value.enter === undefined && value.exit === undefined) return undefined;
  const frames = new Set<number>([0, durationFrames]);
  if (value.enter !== undefined) {
    for (let frame = 0; frame <= Math.min(durationFrames, value.enter.durationFrames); frame += 1) frames.add(frame);
  }
  if (value.exit !== undefined) {
    for (let frame = Math.max(0, durationFrames - value.exit.durationFrames); frame <= durationFrames; frame += 1) frames.add(frame);
  }
  return {
    keyframes: [...frames].sort((left, right) => left - right).map((atFrame) => ({
      atFrame,
      easing: "linear",
      style: style(lifecycleStateAt(value, durationFrames, atFrame)),
    })),
  };
}

function clean(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sustainTransform(value: MediaSustainMotion, phase: number): string {
  const amount = value.amount * phase;
  switch (value.operator) {
    case "float": return `translateY(${amount}px)`;
    case "breathe": return `scale(${1 + amount})`;
    case "pulse": return `scale(${1 + amount})`;
    case "wobble": return `rotate(${amount}deg)`;
    case "shake": return `translateX(${amount}px)`;
    case "drift": return translate(value.direction!, Math.abs(amount) * (phase < 0 ? -1 : 1));
  }
}

function sustainPhases(value: MediaSustainMotion, durationFrames: number): ReadonlyMap<number, number> {
  const states = new Map<number, number>([[0, 0], [durationFrames, 0]]);
  for (let cycle = 0; cycle < value.cycles; cycle += 1) {
    for (const [phaseOffset, phase] of [[0.25, 1], [0.75, -1], [1, 0]] as const) {
      states.set(Math.min(durationFrames, Math.round(
        ((cycle + phaseOffset) / value.cycles) * durationFrames,
      )), phase);
    }
  }
  return states;
}

function phaseAt(states: ReadonlyMap<number, number>, frame: number): number {
  const entries = [...states.entries()].sort(([left], [right]) => left - right);
  const exact = states.get(frame);
  if (exact !== undefined) return exact;
  const rightIndex = entries.findIndex(([atFrame]) => atFrame > frame);
  const right = entries[rightIndex]!;
  const left = entries[rightIndex - 1]!;
  const progress = (frame - left[0]) / (right[0] - left[0]);
  return clean(left[1] + ((right[1] - left[1]) * progress));
}

export function sustainAnimation(value: MediaSustainMotion, durationFrames: number): VisualAnimation {
  assertMediaSustainMotion(value, "Media sustain");
  assert(Number.isSafeInteger(durationFrames) && durationFrames > 0, "Media sustain duration is invalid.");
  const states = sustainPhases(value, durationFrames);
  return {
    keyframes: [...states.entries()].sort(([left], [right]) => left - right).map(([atFrame, phase]) => ({
      atFrame,
      easing: "linear",
      style: [{
        name: "transform",
        value: phase === 0 ? "none" : sustainTransform(value, phase),
      }],
    })),
  };
}

/** Slice one group-global sustain channel without restarting its phase for each member Present. */
export function sustainAnimationWindow(
  value: MediaSustainMotion,
  outerDurationFrames: number,
  startOffset: number,
  endOffset: number,
): VisualAnimation {
  assertMediaSustainMotion(value, "Media sustain");
  assert(Number.isSafeInteger(outerDurationFrames) && outerDurationFrames > 0,
    "Media sustain outer duration is invalid.");
  assert(Number.isSafeInteger(startOffset) && Number.isSafeInteger(endOffset)
    && startOffset >= 0 && endOffset > startOffset && endOffset <= outerDurationFrames,
  "Media sustain window is invalid.");
  const global = sustainPhases(value, outerDurationFrames);
  const frames = new Set<number>([startOffset, endOffset]);
  for (const frame of global.keys()) {
    if (frame > startOffset && frame < endOffset) frames.add(frame);
  }
  return {
    keyframes: [...frames].sort((left, right) => left - right).map((frame) => {
      const phase = phaseAt(global, frame);
      return {
        atFrame: frame - startOffset,
        easing: "linear" as const,
        style: [{ name: "transform", value: phase === 0 ? "none" : sustainTransform(value, phase) }],
      };
    }),
  };
}

type Cubic = readonly [number, number, number, number];

function cubicCoordinate(t: number, first: number, second: number): number {
  const inverse = 1 - t;
  return (3 * inverse * inverse * t * first) + (3 * inverse * t * t * second) + (t * t * t);
}

function eased(progress: number, easing: VisualEasing): number {
  if (easing === "linear" || progress <= 0 || progress >= 1) return progress;
  const curve: Cubic = easing === "ease-in" ? [0.42, 0, 1, 1]
    : easing === "ease-out" ? [0, 0, 0.58, 1]
      : [0.42, 0, 0.58, 1];
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (low + high) / 2;
    if (cubicCoordinate(middle, curve[0], curve[2]) < progress) low = middle;
    else high = middle;
  }
  return cubicCoordinate((low + high) / 2, curve[1], curve[3]);
}

function edgeStateAt(value: MediaEdgeMotion, progressToNeutral: number): MotionState {
  const progress = clean(progressToNeutral);
  const inverse = clean(1 - progress);
  const amount = value.amount ?? (value.operator === "blur-reveal" ? 16 : value.operator === "scale" ? 0.8 : 100);
  switch (value.operator) {
    case "fade": return { ...neutral, opacity: progress };
    case "slide": return { ...neutral, transform: translate(value.direction!, clean(amount * inverse)) };
    case "scale": return { ...neutral, transform: `scale(${clean(amount + ((1 - amount) * progress))})` };
    case "pop": {
      const start = value.amount ?? 0.7;
      return { ...neutral, opacity: progress, transform: `scale(${clean(start + ((1 - start) * progress))})` };
    }
    case "bounce": return {
      ...neutral,
      opacity: progress,
      transform: `translateY(${clean((value.amount ?? 80) * inverse)}px) scale(${clean(0.92 + (0.08 * progress))})`,
    };
    case "blur-reveal": return { ...neutral, opacity: progress, filter: `blur(${clean(amount * inverse)}px)` };
    case "wipe": {
      const percentage = clean(100 * inverse);
      if (value.direction === "left") return { ...neutral, clipPath: `inset(0% 0% 0% ${percentage}%)` };
      if (value.direction === "right") return { ...neutral, clipPath: `inset(0% ${percentage}% 0% 0%)` };
      if (value.direction === "up") return { ...neutral, clipPath: `inset(0% 0% ${percentage}% 0%)` };
      return { ...neutral, clipPath: `inset(${percentage}% 0% 0% 0%)` };
    }
    case "flip": {
      const axis = value.direction === "left" || value.direction === "right" ? "Y" : "X";
      const sign = value.direction === "left" || value.direction === "up" ? -1 : 1;
      return { ...neutral, opacity: progress,
        transform: `perspective(800px) rotate${axis}(${clean(sign * (value.amount ?? 90) * inverse)}deg)` };
    }
    case "spin": return { ...neutral, opacity: progress,
      transform: `rotate(${clean((value.amount ?? 180) * inverse)}deg) scale(${clean(0.8 + (0.2 * progress))})` };
  }
}

function lifecycleStateAt(value: MediaLifecycleMotion, durationFrames: number, frame: number): MotionState {
  const enter = value.enter !== undefined && frame < value.enter.durationFrames
    ? edgeStateAt(value.enter, eased(frame / value.enter.durationFrames, value.enter.easing))
    : neutral;
  let exit = neutral;
  if (value.exit !== undefined) {
    const exitStart = durationFrames - value.exit.durationFrames;
    if (frame > exitStart) {
      const progress = eased((frame - exitStart) / value.exit.durationFrames, value.exit.easing);
      exit = edgeStateAt(value.exit, 1 - progress);
    }
  }
  const transforms = [enter.transform, exit.transform].filter((item) => item !== "none");
  const filters = [enter.filter, exit.filter].filter((item) => item !== "none");
  const clip = (input: string): readonly number[] => /^inset\(([-.\d]+)% ([-.\d]+)% ([-.\d]+)% ([-.\d]+)%\)$/u
    .exec(input)?.slice(1).map(Number) ?? [0, 0, 0, 0];
  const left = clip(enter.clipPath);
  const right = clip(exit.clipPath);
  const clipped = left.map((item, index) => Math.max(item, right[index] ?? 0));
  return {
    opacity: clean(enter.opacity * exit.opacity),
    transform: transforms.join(" ") || "none",
    filter: filters.join(" ") || "none",
    clipPath: `inset(${clipped.map((item) => `${clean(item)}%`).join(" ")})`,
  };
}

/** Slice one outer lifecycle over a member Present; entry/exit never restart at member boundaries. */
export function lifecycleAnimationWindow(
  value: MediaLifecycleMotion,
  outerDurationFrames: number,
  startOffset: number,
  endOffset: number,
): VisualAnimation | undefined {
  assertMediaLifecycleMotion(value, outerDurationFrames, "Media lifecycle");
  assert(Number.isSafeInteger(startOffset) && Number.isSafeInteger(endOffset)
    && startOffset >= 0 && endOffset > startOffset && endOffset <= outerDurationFrames,
  "Media lifecycle window is invalid.");
  if (value.enter === undefined && value.exit === undefined) return undefined;
  const frames = new Set<number>([startOffset, endOffset]);
  if (value.enter !== undefined) {
    const end = value.enter.durationFrames;
    for (let frame = Math.max(startOffset, 0); frame <= Math.min(endOffset, end); frame += 1) frames.add(frame);
  }
  if (value.exit !== undefined) {
    const start = outerDurationFrames - value.exit.durationFrames;
    for (let frame = Math.max(startOffset, start); frame <= Math.min(endOffset, outerDurationFrames); frame += 1) frames.add(frame);
  }
  const ordered = [...frames].sort((left, right) => left - right);
  const compact = ordered.filter((frame, index) => {
    if (index === 0 || index === ordered.length - 1) return true;
    const previous = lifecycleStateAt(value, outerDurationFrames, ordered[index - 1]!);
    const current = lifecycleStateAt(value, outerDurationFrames, frame);
    const next = lifecycleStateAt(value, outerDurationFrames, ordered[index + 1]!);
    return JSON.stringify(previous) !== JSON.stringify(current) || JSON.stringify(current) !== JSON.stringify(next);
  });
  return {
    keyframes: compact.map((frame) => ({
      atFrame: frame - startOffset,
      easing: "linear",
      style: style(lifecycleStateAt(value, outerDurationFrames, frame)),
    })),
  };
}

export function samplingAnimation(value: MediaSamplingMotion, durationFrames: number): VisualAnimation {
  assert(value.keyframes.length >= 2, "Media sampling motion requires keyframes.");
  assert(value.keyframes[0]?.atProgress === 0 && value.keyframes.at(-1)?.atProgress === 1,
    "Media sampling motion must cover normalized progress [0, 1].");
  let previous = -1;
  return {
    keyframes: value.keyframes.map((keyframe, index) => {
      const atFrame = Math.round(keyframe.atProgress * durationFrames);
      assert(atFrame > previous,
        `Media sampling keyframe ${index + 1} collapses after frame quantization; use fewer or wider-spaced keyframes.`);
      previous = atFrame;
      return {
        atFrame,
        ...(keyframe.easing === undefined ? {} : { easing: keyframe.easing }),
        style: [{
          name: "transform",
          value: `translate(${keyframe.offsetX}px,${keyframe.offsetY}px) rotate(${keyframe.rotationDeg}deg) scale(${keyframe.zoom})`,
        }],
      };
    }),
  };
}
