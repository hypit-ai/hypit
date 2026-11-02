import type {
  HtmlAnimation as VisualAnimation,
  HtmlStyleDeclaration as VisualStyleDeclaration,
} from "@hypit/html-program";
import { canonicalize } from "@hypit/hypit/protocol";

import type {
  MediaSamplingMotion,
  VisualClipMotion,
  VisualMotionPosition,
  VisualPoseKeyframe,
  VisualMotionProperty,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite.`);
}

function unit(value: number, label: string): void {
  finite(value, label);
  assert(value >= 0 && value <= 1, `${label} must be inside [0, 1].`);
}

export function assertVisualMotionPosition(value: VisualMotionPosition, label: string): void {
  if (value.kind === "progress") {
    unit(value.value, `${label}.value`);
    return;
  }
  assert(value.kind === "start" || value.kind === "end", `${label}.kind is invalid.`);
  assert(Number.isSafeInteger(value.offsetFrames), `${label}.offsetFrames must be an integer.`);
  assert(value.kind === "start" ? value.offsetFrames >= 0 : value.offsetFrames <= 0,
    `${label} points away from its ${value.kind} boundary.`);
}

export function resolveVisualMotionPosition(value: VisualMotionPosition, durationFrames: number): number {
  assertVisualMotionPosition(value, "Visual motion position");
  assert(Number.isSafeInteger(durationFrames) && durationFrames > 0, "Visual motion duration is invalid.");
  const frame = value.kind === "progress"
    ? Math.round(value.value * durationFrames)
    : value.kind === "start" ? value.offsetFrames : durationFrames + value.offsetFrames;
  assert(frame >= 0 && frame <= durationFrames, "Visual motion position is outside its Clip Window.");
  return frame;
}

function assertPose(value: VisualPoseKeyframe, label: string): void {
  assertVisualMotionPosition(value.at, `${label}.at`);
  finite(value.translateX, `${label}.translateX`);
  finite(value.translateY, `${label}.translateY`);
  finite(value.scaleX, `${label}.scaleX`);
  finite(value.scaleY, `${label}.scaleY`);
  assert(value.scaleX !== 0 && value.scaleY !== 0, `${label} scale must be nonzero.`);
  finite(value.rotationDeg, `${label}.rotationDeg`);
  unit(value.opacity, `${label}.opacity`);
  unit(value.originX, `${label}.originX`);
  unit(value.originY, `${label}.originY`);
  if (value.easing !== undefined) {
    assert(["linear", "ease-in", "ease-out", "ease-in-out"].includes(value.easing), `${label}.easing is invalid.`);
  }
}

/** Validate a reusable Motion without assuming the duration of the Clip that will consume it. */
export function assertVisualClipMotion(value: VisualClipMotion, label: string): void {
  assert(Array.isArray(value.keyframes) && value.keyframes.length >= 1, `${label} needs at least one keyframe.`);
  for (const [index, keyframe] of value.keyframes.entries()) assertPose(keyframe, `${label}.keyframes.${index}`);
  const seen = new Set<string>();
  for (const channel of value.channels ?? []) {
    assert(['translateX', 'translateY', 'rotationDeg', 'scaleX', 'scaleY', 'opacity'].includes(channel.property), `${label} property is invalid.`);
    assert(!seen.has(channel.property), `${label} property channel is repeated.`); seen.add(channel.property);
    assert(channel.keyframes.length > 0, `${label} property channel needs keyframes.`);
    for (const key of channel.keyframes) {
      assertVisualMotionPosition(key.at, `${label}.${channel.property}.at`); finite(key.value, `${label}.${channel.property}.value`);
      if (channel.property === 'scaleX' || channel.property === 'scaleY') assert(key.value !== 0, `${label} scale must be nonzero.`);
      if (channel.property === 'opacity') unit(key.value, `${label}.opacity`);
      if (key.easing) assert(['linear','ease-in','ease-out','ease-in-out'].includes(key.easing), `${label} easing is invalid.`);
    }
  }
  const origin = value.keyframes[0]!;
  assert(value.keyframes.every((keyframe) => keyframe.originX === origin.originX && keyframe.originY === origin.originY),
    `${label} transform origin must remain constant; animate sampling or author a component when the pivot itself changes.`);
}

export function sealVisualClipMotion(value: VisualClipMotion): VisualClipMotion {
  assertVisualClipMotion(value, "VisualClipMotion");
  return canonicalize(value) as unknown as VisualClipMotion;
}

/** Resolve and validate one Motion against the local clock of a concrete Clip. */
function resolvedKeyframes(value: VisualClipMotion, durationFrames: number): readonly {
  readonly frame: number;
  readonly pose: VisualPoseKeyframe;
}[] {
  assertVisualClipMotion(value, "Visual motion");
  let previous = -1;
  const resolved = value.keyframes.map((pose, index) => {
    const frame = resolveVisualMotionPosition(pose.at, durationFrames);
    assert(frame > previous,
      `Visual motion keyframe ${index + 1} collapses or is out of order on this Clip clock.`);
    previous = frame;
    return { frame, pose };
  });
  const first = resolved[0]!, last = resolved.at(-1)!;
  if (first.frame > 0) resolved.unshift({ frame: 0, pose: first.pose });
  if (last.frame < durationFrames) resolved.push({ frame: durationFrames, pose: last.pose });
  return resolved;
}

function clean(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function poseStyle(value: Omit<VisualPoseKeyframe, "at" | "easing">): readonly VisualStyleDeclaration[] {
  const transform = value.translateX === 0 && value.translateY === 0
    && value.rotationDeg === 0 && value.scaleX === 1 && value.scaleY === 1
    ? "none"
    : `translate(${clean(value.translateX)}px,${clean(value.translateY)}px) rotate(${clean(value.rotationDeg)}deg) scale(${clean(value.scaleX)},${clean(value.scaleY)})`;
  return [
    { name: "opacity", value: clean(value.opacity) },
    { name: "transform", value: transform },
  ];
}

export function poseAnimation(value: VisualClipMotion | undefined, durationFrames: number): VisualAnimation | undefined {
  if (value === undefined) return undefined;
  assert(!value.channels?.length, 'Independent property motion requires poseAnimations.');
  return {
    keyframes: resolvedKeyframes(value, durationFrames).map(({ frame, pose }) => ({
      atFrame: frame,
      ...(pose.easing === undefined ? {} : { easing: pose.easing }),
      style: poseStyle(pose),
    })),
  };
}

/** Compose independent property curves in translate, rotate, scale order. */
export function poseAnimations(value: VisualClipMotion | undefined, durationFrames: number): readonly VisualAnimation[] {
  if (!value) return [];
  if (!value.channels?.length) return [poseAnimation(value, durationFrames)!];
  const base = resolvedKeyframes(value, durationFrames);
  const properties: readonly VisualMotionProperty[] = ['translateX', 'translateY', 'rotationDeg', 'scaleX', 'scaleY', 'opacity'];
  return properties.map(property => {
    const channel = value.channels!.find(item => item.property === property);
    const keys = channel ? channel.keyframes.map(key => ({ frame: resolveVisualMotionPosition(key.at, durationFrames), value: key.value, easing: key.easing }))
      : base.map(key => ({ frame: key.frame, value: key.pose[property], easing: key.pose.easing }));
    let previous = -1;
    for (const key of keys) { assert(key.frame > previous, `Motion ${property} keyframes must be ordered.`); previous = key.frame; }
    const first = keys[0]!, last = keys.at(-1)!;
    if (first.frame > 0) keys.unshift({ ...first, frame: 0 });
    if (last.frame < durationFrames) keys.push({ ...last, frame: durationFrames });
    return { keyframes: keys.map(key => ({ atFrame: key.frame, ...(key.easing ? { easing: key.easing } : {}), style: [property === 'opacity' ? { name: 'opacity', value: key.value } : {
      name: 'transform', value: `${property === 'rotationDeg' ? 'rotate' : property}(${clean(key.value)}${property.startsWith('translate') ? 'px' : property === 'rotationDeg' ? 'deg' : ''})`,
    }] })) };
  });
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
