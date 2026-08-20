import type { StudioAdapter } from "./types.js";
import { readonlyInteraction } from "./types.js";

export const genericAdapters: readonly StudioAdapter[] = [
  { id: "caption-plan", role: "caption-plan", output: { type: "CaptionPlan" } },
  {
    id: "text", role: "text", output: { type: "VisualTrack", surface: "track", modules: ["@hypit/typography-track"] },
    family: "text", icon: "title", interaction: readonlyInteraction,
  },
  {
    id: "caption", role: "caption", output: { type: "VisualTrack", surface: "track", modules: ["@hypit/caption-fine"] },
    family: "caption", icon: "subtitles", interaction: readonlyInteraction,
    dependencies: [{ type: "CaptionPlan", role: "caption-plan" }],
  },
  {
    id: "component", role: "track",
    output: { type: "VisualTrack", modules: ["@hypit/ranking", "@hypit/comment-sticker", "@hypit/screen-overlay", "@hypit/deck-track"] },
    family: "component", icon: "widgets", interaction: readonlyInteraction,
  },
  { id: "audio-fallback", role: "track", output: { type: "AudioTrack" }, family: "audio", icon: "graphic_eq", interaction: readonlyInteraction },
  { id: "visual-fallback", role: "track", output: { type: "VisualTrack" }, family: "visual", icon: "layers", interaction: readonlyInteraction },
];
