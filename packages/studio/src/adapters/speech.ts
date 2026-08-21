import type { StudioAdapter } from "./types.js";
import { laneHeights } from "./types.js";

export const speechAdapters: readonly StudioAdapter[] = [
  { id: "semantic-take", role: "semantic-take", output: { type: "SemanticTake" } },
  {
    id: "semantic-track", role: "semantic-track", output: { type: "SemanticTrack" },
    family: "speech", label: "Speech", icon: "speech",
    lane: { layout: "flat", height: laneHeights.semantic },
  },
];
