import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "./types.js";
import { childEntities, laneHeights, readonlyInteraction, sameSurfaceValue } from "./types.js";

type AudioTrackProgramValue = {
  readonly items?: readonly {
    readonly id: string;
    readonly window: { readonly startFrame: number; readonly endFrameExclusive: number };
    readonly source: { readonly artifact: { readonly digest: string } };
  }[];
};

function projectAudio(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const program = sameSurfaceValue(context, "program") as AudioTrackProgramValue | undefined;
  if (program?.items === undefined) return context.generic();
  const items = program.items.map((item) => ({
    id: item.id, startFrame: item.window.startFrame, endFrameExclusive: item.window.endFrameExclusive,
    stackOrder: Number.MIN_SAFE_INTEGER,
    preview: { kind: "audio" as const, url: `/__studio/material/${item.source.artifact.digest}` },
  }));
  return childEntities(context, items, "audio-clip", "waveform").map((entity, index) => ({
    ...entity,
    preview: items[index]!.preview,
  }));
}

export const audioAdapters: readonly StudioAdapter[] = [
  { id: "audio-program", role: "realization", output: { type: "AudioTrackProgram", modules: ["@hypit/audio-track"] } },
  {
    id: "audio", role: "track", output: { type: "AudioTrack", surface: "track", modules: ["@hypit/audio-track"] },
    family: "audio", icon: "waveform", interaction: readonlyInteraction,
    realizationPorts: ["program"], project: projectAudio,
    lane: { layout: "flat", height: laneHeights.audio },
  },
];
