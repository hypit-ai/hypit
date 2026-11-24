import type { NlePictureFrame } from "@hypit/nle";

/** Audio is queued ahead of the playhead in bounded intervals on the edit grid. */
export const programmeAudioFrames = (fps: number): number => Math.max(1, Math.floor(4 * fps));
export const programmeAudioSampleRate = 48_000;

export type ProgrammePlacementDraft = {
  readonly generation: string;
  readonly items: readonly string[];
  readonly initial: NlePictureFrame;
  readonly frame: NlePictureFrame;
};
