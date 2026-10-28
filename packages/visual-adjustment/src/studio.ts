import { compositionTypes } from "@hypit/composition";
import type {
  StudioTrackCompanion,
  StudioTrackCompanionContext,
} from "@hypit/studio-companion";
import { temporalLineageFor } from "@hypit/studio-companion";
import { visualAdjustmentModuleRef } from "./manifest.js";

function project(context: StudioTrackCompanionContext) {
  return context.generic().map((item) => {
    const temporal = temporalLineageFor(context, item.authoredId, "window");
    return { ...item, ...(temporal === undefined ? {} : { temporal }) };
  });
}

export const visualAdjustmentStudioTrackCompanions: readonly StudioTrackCompanion[] = [{
  id: "track",
  output: { type: compositionTypes.visualTrack, declaration: "track", modules: [visualAdjustmentModuleRef] },
  family: "visual-adjustment",
  tone: "violet",
  label: "Adjustments",
  icon: "layers",
  lane: { heightPx: 32 },
  project,
}];
