import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "./types.js";
import { childEntities, readonlyInteraction, sameSurfaceValue } from "./types.js";
import { itemTemporalLineage } from "./temporal.js";

type MediaTrackProgramValue = {
  readonly items?: readonly { readonly id: string; readonly span: { readonly startFrame: number; readonly endFrameExclusive: number }; readonly stacking: { readonly order: number } }[];
  readonly sequences?: readonly { readonly id: string; readonly span: { readonly startFrame: number; readonly endFrameExclusive: number }; readonly stacking: { readonly order: number } }[];
};

function projectMedia(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const program = sameSurfaceValue(context, "program") as MediaTrackProgramValue | undefined;
  if (program === undefined) return context.generic();
  const items = [...(program.items ?? []), ...(program.sequences ?? [])].map((item) => ({
    id: item.id, startFrame: item.span.startFrame, endFrameExclusive: item.span.endFrameExclusive,
    stackOrder: item.stacking.order,
  }));
  return childEntities(context, items, "media-item",
    context.track.type === "AudioTrack" ? "waveform" : "picture").map((entity, index) => {
    const item = items[index];
    if (item === undefined) return entity;
    const temporal = itemTemporalLineage({
      runtimeId: item.id, span: item,
      ...(context.placement === undefined ? {} : { placement: context.placement }),
    });
    return temporal === undefined ? entity : { ...entity, temporal };
  });
}

export const mediaAdapters: readonly StudioAdapter[] = [
  { id: "media-program", role: "realization", output: { type: "MediaTrackProgram", modules: ["@hypit/media-track"] } },
  {
    id: "media-visual", role: "media",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/media-track"] },
    family: "media", icon: "video", interaction: readonlyInteraction,
    realizationPorts: ["program"], project: projectMedia,
  },
  {
    id: "media-audio", role: "media",
    output: { type: "AudioTrack", surface: "track", modules: ["@hypit/media-track"] },
    family: "media", icon: "waveform", interaction: readonlyInteraction,
    realizationPorts: ["program"], project: projectMedia,
  },
];
