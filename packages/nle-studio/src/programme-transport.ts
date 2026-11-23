/** Audio is queued ahead of the playhead in bounded intervals on the edit grid. */
export const programmeAudioFrames = (fps: number): number => Math.max(1, Math.floor(4 * fps));
export const programmeAudioSampleRate = 48_000;
