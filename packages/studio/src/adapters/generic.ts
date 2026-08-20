import type { StudioAdapter, StudioAdapterContext, StudioEntityDraft } from "./types.js";
import { childEntities, readonlyInteraction, sameSurfaceValue } from "./types.js";
import { itemTemporalLineage } from "./temporal.js";

type TypographyTrackProgram = {
  readonly items?: readonly {
    readonly id: string;
    readonly span: { readonly startFrame: number; readonly endFrameExclusive: number };
    readonly style: { readonly stackingOrder: number };
  }[];
};

function projectText(context: StudioAdapterContext): readonly StudioEntityDraft[] {
  const program = sameSurfaceValue(context, "program") as TypographyTrackProgram | undefined;
  if (program?.items === undefined) return context.generic();
  const items = program.items.map((item) => ({
    id: item.id,
    startFrame: item.span.startFrame,
    endFrameExclusive: item.span.endFrameExclusive,
    stackOrder: item.style.stackingOrder,
  }));
  return childEntities(context, items, "typography-item", "text").map((entity, index) => {
    const item = items[index];
    if (item === undefined) return entity;
    const temporal = itemTemporalLineage({
      runtimeId: item.id, span: item,
      ...(context.placement === undefined ? {} : { placement: context.placement }),
    });
    return temporal === undefined ? entity : { ...entity, temporal };
  });
}

export const genericAdapters: readonly StudioAdapter[] = [
  { id: "caption-plan", role: "caption-plan", output: { type: "CaptionPlan" } },
  { id: "typography-program", role: "realization", output: { type: "TypographyTrackProgram", modules: ["@hypit/typography-track"] } },
  {
    id: "text", role: "text", output: { type: "VisualTrack", surface: "track", modules: ["@hypit/typography-track"] },
    family: "text", icon: "text", interaction: readonlyInteraction,
    realizationPorts: ["program"], project: projectText,
  },
  {
    id: "caption", role: "caption", output: { type: "VisualTrack", surface: "track", modules: ["@hypit/caption-fine"] },
    family: "caption", icon: "captions", interaction: readonlyInteraction,
    dependencies: [{ type: "CaptionPlan", role: "caption-plan" }],
  },
  {
    id: "component", role: "track",
    output: { type: "VisualTrack", modules: ["@hypit/ranking", "@hypit/comment-sticker", "@hypit/screen-overlay", "@hypit/deck-track"] },
    family: "component", icon: "component", interaction: readonlyInteraction,
  },
  { id: "audio-fallback", role: "track", output: { type: "AudioTrack" }, family: "audio", icon: "waveform", interaction: readonlyInteraction },
  { id: "visual-fallback", role: "track", output: { type: "VisualTrack" }, family: "visual", icon: "layers", interaction: readonlyInteraction },
];
