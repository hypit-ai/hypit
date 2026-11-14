import type { NleTimelineAdjustmentPresentation } from "@hypit/nle-view";

import { audioGainNleSymbol } from "./nle.js";

export const audioGainNlePresentation: NleTimelineAdjustmentPresentation = {
  operator: audioGainNleSymbol,
  displayName: "Gain",
  tone: "green",
  chrome: "compact",
  heightPx: 32,
};
