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
  assert(value.scaleX > 0 && value.scaleY > 0, `${label} scale must be positive.`);
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
  const origin = value.keyframes[0]!;
  if (value.keyframes.length === 1) {
    assert(origin.at.kind === "start" && origin.at.offsetFrames === 0,
      `${label} single Pose must be anchored at start.`);
  }
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
  if (resolved.length === 1) return [resolved[0]!, { frame: durationFrames, pose: resolved[0]!.pose }];
  assert(resolved[0]!.frame === 0 && resolved.at(-1)!.frame === durationFrames,
    "Visual motion must cover the complete Clip-local clock from start through end.");
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
  return {
    keyframes: resolvedKeyframes(value, durationFrames).map(({ frame, pose }) => ({
      atFrame: frame,
      ...(pose.easing === undefined ? {} : { easing: pose.easing }),
      style: poseStyle(pose),
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
