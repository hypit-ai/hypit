import { animationDuration, assertAnimationClock, type AnimationClock } from "./animation-clock.js";

export type VisualScopeMotionProperty = 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity';
export type VisualScopeMotionChannel = {
  readonly property: VisualScopeMotionProperty;
  readonly keyframes: readonly { readonly frame: number; readonly value: number; readonly easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' }[];
};
/** Keyframe positions use the complete occurrence clock, retained when its visible interval is clipped. */
export type VisualScopeMotion = { readonly clock: AnimationClock; readonly channels: readonly VisualScopeMotionChannel[] };

export function assertVisualScopeMotion(value: VisualScopeMotion): void {
  const duration = animationDuration(value.clock);
  assertAnimationClock(value.clock);
  if (!Number.isSafeInteger(value.clock.startFrame) || !Number.isSafeInteger(value.clock.endFrameExclusive) || duration <= 0) throw new Error('VisualScope motion clock is invalid.');
  const properties = new Set<string>();
  if (!Array.isArray(value.channels) || !value.channels.length) throw new Error('VisualScope motion requires channels.');
  for (const channel of value.channels) {
    if (!['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'].includes(channel.property) || properties.has(channel.property)) throw new Error('VisualScope motion property is invalid or repeated.');
    properties.add(channel.property);
    if (!channel.keyframes.length) throw new Error('VisualScope motion channel requires keyframes.');
    let previous = -1;
    for (const key of channel.keyframes) {
      if (!Number.isSafeInteger(key.frame) || key.frame <= previous || key.frame > duration || !Number.isFinite(key.value)) throw new Error('VisualScope keyframes must be ordered inside the occurrence clock.');
      if ((channel.property === 'scaleX' || channel.property === 'scaleY') && key.value === 0) throw new Error('VisualScope keyframe scale must be nonzero.');
      if (channel.property === 'opacity' && (key.value < 0 || key.value > 1)) throw new Error('VisualScope opacity must be inside [0, 1].');
      if (key.easing && !['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(key.easing)) throw new Error('VisualScope keyframe easing is invalid.');
      previous = key.frame;
    }
  }
}
