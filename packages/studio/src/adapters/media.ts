import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "./types.js";
import { childEntities, readonlyInteraction, sameSurfaceValue } from "./types.js";

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
    context.track.type === "AudioTrack" ? "waveform" : "picture");
}

export const mediaAdapters: readonly StudioAdapter[] = [
  { id: "media-program", role: "realization", output: { type: "MediaTrackProgram", modules: ["@hypit/media-track"] } },
  {
    id: "media-visual", role: "media",
    output: { type: "VisualTrack", surface: "track", modules: ["@hypit/media-track"] },
    family: "media", icon: "movie", interaction: readonlyInteraction,
    realizationPorts: ["program"], project: projectMedia,
  },
  {
    id: "media-audio", role: "media",
    output: { type: "AudioTrack", surface: "track", modules: ["@hypit/media-track"] },
    family: "media", icon: "graphic_eq", interaction: readonlyInteraction,
    realizationPorts: ["program"], project: projectMedia,
  },
];
