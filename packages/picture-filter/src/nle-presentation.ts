import type { NleTimelineAdjustmentPresentation } from "@hypit/nle-view";

import { pictureFilterNleSymbol } from "./nle.js";

export const pictureFilterNlePresentation: NleTimelineAdjustmentPresentation = {
  component: pictureFilterNleSymbol,
  displayName: "Filter",
  tone: "violet",
  chrome: "compact",
  heightPx: 32,
};
