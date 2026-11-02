/** Shared browser evaluation for renderer-neutral authored animation clocks. */
export const animationClockRuntime = `
const htmlAnimationFrame = (clock, frame) => (clock.sampling?.offset ?? 0) + (frame - clock.startFrame) * (clock.sampling?.rate ?? 1);
const htmlAnimationDuration = clock => clock.sampling?.durationFrames ?? clock.endFrameExclusive - clock.startFrame;
`;
