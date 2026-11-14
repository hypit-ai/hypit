import type { NleTimelineAdjustmentPresentation } from "@hypit/nle-view";

import { pictureFrameNleSymbol } from "./nle.js";

export const pictureFrameNlePresentation: NleTimelineAdjustmentPresentation = {
  operator: pictureFrameNleSymbol,
  displayName: "Frame",
  tone: "violet",
  chrome: "compact",
  heightPx: 32,
};
