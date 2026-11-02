import type { FrameSpan } from '@hypit/timeline';

/** An occurrence clock with an optional affine mapping into its authored animation. */
export type AnimationClock = FrameSpan & {
  readonly sampling?: { readonly offset: number; readonly rate: number; readonly durationFrames: number };
};
export function animationDuration(clock: AnimationClock): number {
  return clock.sampling?.durationFrames ?? clock.endFrameExclusive - clock.startFrame;
}
export function animationFrame(clock: AnimationClock, frame: number): number {
  return (clock.sampling?.offset ?? 0) + (frame - clock.startFrame) * (clock.sampling?.rate ?? 1);
}
export function assertAnimationClock(clock: AnimationClock): void {
  if (!Number.isSafeInteger(clock.startFrame) || !Number.isSafeInteger(clock.endFrameExclusive)
    || clock.endFrameExclusive <= clock.startFrame) throw new Error('Animation clock requires an ordered frame interval.');
  if (clock.sampling && (!Number.isFinite(clock.sampling.offset) || !Number.isFinite(clock.sampling.rate)
    || clock.sampling.rate <= 0 || !Number.isSafeInteger(clock.sampling.durationFrames)
    || clock.sampling.durationFrames <= 0)) throw new Error('Animation sampling requires a positive rate and authored frame duration.');
}
export function placeAnimationClock(clock: AnimationClock, sourceStart: number, targetStart: number, rate: number): AnimationClock {
  const startFrame = Math.ceil(targetStart + (clock.startFrame - sourceStart) / rate - 1e-9);
  const endFrameExclusive = Math.max(startFrame + 1, Math.ceil(targetStart + (clock.endFrameExclusive - sourceStart) / rate - 1e-9));
  const offset = animationFrame(clock, sourceStart + (startFrame - targetStart) * rate);
  return { startFrame, endFrameExclusive, ...(rate !== 1 || clock.sampling || Math.abs(offset) > 1e-9
    ? { sampling: { offset, rate: rate * (clock.sampling?.rate ?? 1), durationFrames: animationDuration(clock) } } : {}) };
}
