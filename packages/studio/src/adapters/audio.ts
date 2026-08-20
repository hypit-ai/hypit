import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "./types.js";
import { childEntities, readonlyInteraction, sameSurfaceValue } from "./types.js";

type AudioTrackProgramValue = {
  readonly items?: readonly { readonly id: string; readonly window: { readonly startFrame: number; readonly endFrameExclusive: number } }[];
};

function projectAudio(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const program = sameSurfaceValue(context, "program") as AudioTrackProgramValue | undefined;
  if (program?.items === undefined) return context.generic();
  return childEntities(context, program.items.map((item) => ({
    id: item.id, startFrame: item.window.startFrame, endFrameExclusive: item.window.endFrameExclusive,
    stackOrder: Number.MIN_SAFE_INTEGER,
  })), "audio-clip", "waveform");
}

export const audioAdapters: readonly StudioAdapter[] = [
  { id: "audio-program", role: "realization", output: { type: "AudioTrackProgram", modules: ["@hypit/audio-track"] } },
  {
    id: "audio", role: "track", output: { type: "AudioTrack", surface: "track", modules: ["@hypit/audio-track"] },
    family: "audio", icon: "graphic_eq", interaction: readonlyInteraction,
    realizationPorts: ["program"], project: projectAudio,
  },
];
