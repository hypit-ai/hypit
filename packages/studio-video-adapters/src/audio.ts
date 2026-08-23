import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "@hypit/studio-adapter";
import { childEntities, readonlyInteraction, sameSurfaceValue } from "@hypit/studio-adapter";
import { videoLaneHeights } from "./presentation.js";
import { itemTemporalLineage } from "./temporal.js";

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
  return childEntities(context, items, "audio-clip", "waveform").map((entity, index) => {
    const temporal = itemTemporalLineage(context, items[index]!.id);
    return {
      ...entity,
      preview: items[index]!.preview,
      ...(temporal?.source.kind === "program" || temporal?.source.id === undefined
        ? {}
        : { markerId: temporal.source.id }),
      ...(temporal === undefined ? {} : { temporal }),
    };
  });
}

export const audioAdapters: readonly StudioAdapter[] = [
  { id: "audio-program", role: "realization", output: { type: "AudioTrackProgram", modules: ["@hypit/audio-track"] } },
  {
    id: "audio", role: "track", output: { type: "AudioTrack", surface: "track", modules: ["@hypit/audio-track"] },
    family: "audio", icon: "waveform", interaction: readonlyInteraction,
    timelineGestures: ["move", "trim-start", "trim-end"],
    parameters: [
      { name: "semantic", label: "Semantic", writable: false },
      { name: "source", label: "Source", writable: false },
      { name: "during", label: "During", writable: false },
      { name: "selection", label: "Selection", writable: false },
      { name: "moment", label: "Moment", writable: false },
      { name: "start", label: "Start", writable: true },
      { name: "end", label: "End", writable: true },
      { name: "at", label: "At", writable: false },
      { name: "for", label: "For", writable: true },
      { name: "trim-start", label: "Trim source start", writable: false },
      { name: "trim-end", label: "Trim source end", writable: false },
      { name: "playback", label: "Playback", writable: false },
      { name: "min-rate", label: "Minimum rate", control: "number", writable: false },
      { name: "max-rate", label: "Maximum rate", control: "number", writable: false },
      { name: "gain", label: "Gain", control: "number", writable: true },
      { name: "fade-in", label: "Fade in", writable: true },
      { name: "fade-out", label: "Fade out", writable: true },
    ],
    realizationPorts: ["program"], project: projectAudio,
    lane: { layout: "flat", height: videoLaneHeights.audio },
  },
];
